from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import re

import spacy
import nltk
from nltk.corpus import stopwords
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
from sentence_transformers import SentenceTransformer, util

# Load models
nlp        = spacy.load("en_core_web_sm")
sbert      = SentenceTransformer("all-MiniLM-L6-v2")
stop_words = set(stopwords.words("english"))

app = FastAPI()

# ── Request / Response models ─────────────────────────────────────────────────
class ProjectText(BaseModel):
    title:      str
    abstract:   Optional[str] = ""
    objectives: Optional[str] = ""

class ArchivedProject(BaseModel):
    id:         int
    title:      str
    abstract:   Optional[str] = ""
    objectives: Optional[str] = ""

class CheckRequest(BaseModel):
    new_project: ProjectText
    archived:    List[ArchivedProject]
    use_sbert:   Optional[bool] = True   # ← Free plan sends False

class ExplainRequest(BaseModel):
    own_text:   str
    other_text: str

# ── Text preprocessing ────────────────────────────────────────────────────────
def preprocess(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    doc  = nlp(text)
    tokens = [
        token.lemma_ for token in doc
        if token.text not in stop_words and not token.is_punct and not token.is_space
    ]
    return " ".join(tokens)

# ── Similarity functions ──────────────────────────────────────────────────────
def tfidf_similarity(text_a: str, text_b: str) -> float:
    a = preprocess(text_a)
    b = preprocess(text_b)
    if not a.strip() or not b.strip():
        return 0.0
    try:
        vec    = TfidfVectorizer()
        matrix = vec.fit_transform([a, b])
        score  = sklearn_cosine(matrix[0], matrix[1])[0][0]
        return round(float(score) * 100, 2)
    except Exception:
        return 0.0

def sbert_similarity(text_a: str, text_b: str) -> float:
    if not text_a.strip() or not text_b.strip():
        return 0.0
    emb_a = sbert.encode(text_a, convert_to_tensor=True)
    emb_b = sbert.encode(text_b, convert_to_tensor=True)
    score = util.cos_sim(emb_a, emb_b).item()
    return round(max(0.0, score) * 100, 2)

def split_segments(text: str) -> List[str]:
    """Split text into sentence/clause-level segments for phrase-level comparison."""
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]

def combined_similarity(text_a: str, text_b: str, use_sbert: bool = True) -> float:
    """
    Pro plan:  50% SBERT + 50% TF-IDF  (semantic + keyword)
    Free plan: 100% TF-IDF only
    """
    if not text_a.strip() or not text_b.strip():
        return 0.0
    if use_sbert:
        s = sbert_similarity(text_a, text_b)
        t = tfidf_similarity(text_a, text_b)
        return round((s * 0.5) + (t * 0.5), 2)
    else:
        return tfidf_similarity(text_a, text_b)

# ── API endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ThesisGuard similarity service running"}

@app.post("/check")
def check_similarity(req: CheckRequest):
    results = []

    for old in req.archived:
        title_score      = combined_similarity(req.new_project.title,      old.title,      req.use_sbert)
        abstract_score   = combined_similarity(req.new_project.abstract,   old.abstract,   req.use_sbert)
        objectives_score = combined_similarity(req.new_project.objectives, old.objectives, req.use_sbert)

        # Weighted overall: title 40%, abstract 35%, objectives 25%
        overall = round(
            (title_score      * 0.40) +
            (abstract_score   * 0.35) +
            (objectives_score * 0.25),
            2
        )

        if overall > 5:
            results.append({
                "compared_to_id":   old.id,
                "compared_title":   old.title,
                "title_score":      title_score,
                "abstract_score":   abstract_score,
                "objectives_score": objectives_score,
                "overall_score":    overall,
            })

    results.sort(key=lambda x: x["overall_score"], reverse=True)

    top = results[0] if results else None
    return {
        "overall_score":    top["overall_score"]    if top else 0,
        "title_score":      top["title_score"]      if top else 0,
        "abstract_score":   top["abstract_score"]   if top else 0,
        "objectives_score": top["objectives_score"] if top else 0,
        "matches":          results,
        "method":           "SBERT + TF-IDF" if req.use_sbert else "TF-IDF only",
    }

# Verbatim phrase-overlap (see frontend utils/textOverlap.js) only catches
# identical wording. This endpoint finds SEMANTICALLY similar segments even
# when the wording is completely different, using sentence-level SBERT
# embeddings — so a paraphrased sentence can still be surfaced as a match.
SEMANTIC_MATCH_THRESHOLD = 55.0

@app.post("/explain")
def explain_similarity(req: ExplainRequest):
    own_segments   = split_segments(req.own_text)
    other_segments = split_segments(req.other_text)

    if not own_segments or not other_segments:
        return {"segments": []}

    own_embs   = sbert.encode(own_segments, convert_to_tensor=True)
    other_embs = sbert.encode(other_segments, convert_to_tensor=True)
    sim_matrix = util.cos_sim(own_embs, other_embs)

    segments = []
    for i, seg in enumerate(own_segments):
        best_idx   = int(sim_matrix[i].argmax())
        best_score = round(max(0.0, sim_matrix[i][best_idx].item()) * 100, 2)
        matched    = best_score >= SEMANTIC_MATCH_THRESHOLD
        segments.append({
            "text":         seg,
            "matched":      matched,
            "score":        best_score,
            "matched_with": other_segments[best_idx] if matched else None,
        })

    return {"segments": segments, "threshold": SEMANTIC_MATCH_THRESHOLD}




    # PS C:\xampp\htdocs\similarity-service> python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload