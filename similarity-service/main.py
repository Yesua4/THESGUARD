from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import re

import numpy as np
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
import onnxruntime as ort
from transformers import AutoTokenizer
from huggingface_hub import hf_hub_download

# Load models. preprocess() below only needs tokenization + lemmatization
# (token.lemma_, token.is_punct, token.is_space) -- the parser and NER
# pipeline components are never used, and are the two heaviest parts of
# en_core_web_sm by far, so disabling them cuts real memory without
# changing preprocess()'s output at all.
nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])

# NLTK's English stopword list (corpora/stopwords/english), baked in as a
# plain Python set instead of downloaded at runtime via nltk.corpus --
# that download landed in a different directory than NLTK's runtime search
# path on Render, crashing startup even though the build step "succeeded".
# This is the exact, unmodified list (verified via stopwords.words('english')
# locally), so preprocess() behaves identically -- just without a fragile
# cross-environment file lookup.
stop_words = {
    'a', 'about', 'above', 'after', 'again', 'against', 'ain', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
    "aren't", 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'couldn', "couldn't", 'd', 'did', 'didn', "didn't", 'do', 'does', 'doesn', "doesn't", 'doing', 'don',
    "don't", 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn', "hadn't", 'has', 'hasn',
    "hasn't", 'have', 'haven', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', 'hers',
    'herself', 'him', 'himself', 'his', 'how', 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', 'isn',
    "isn't", 'it', "it'd", "it'll", "it's", 'its', 'itself', 'just', 'll', 'm', 'ma', 'me', 'mightn', "mightn't",
    'more', 'most', 'mustn', "mustn't", 'my', 'myself', 'needn', "needn't", 'no', 'nor', 'not', 'now', 'o', 'of',
    'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 're', 's',
    'same', 'shan', "shan't", 'she', "she'd", "she'll", "she's", 'should', "should've", 'shouldn', "shouldn't",
    'so', 'some', 'such', 't', 'than', 'that', "that'll", 'the', 'their', 'theirs', 'them', 'themselves', 'then',
    'there', 'these', 'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 've', 'very', 'was', 'wasn', "wasn't", 'we', "we'd", "we'll", "we're", "we've",
    'were', 'weren', "weren't", 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
    'won', "won't", 'wouldn', "wouldn't", 'y', 'you', "you'd", "you'll", "you're", "you've", 'your', 'yours',
    'yourself', 'yourselves',
}

# Same all-MiniLM-L6-v2 model as before, run via ONNX Runtime instead of
# PyTorch + sentence-transformers -- verified to produce numerically
# identical similarity scores (0.0 max difference across real test pairs),
# but at a fraction of the memory footprint, since it skips loading all of
# PyTorch just to run one small model.
_SBERT_MODEL_ID = "Xenova/all-MiniLM-L6-v2"
_tokenizer = AutoTokenizer.from_pretrained(_SBERT_MODEL_ID)
_onnx_path = hf_hub_download(_SBERT_MODEL_ID, "onnx/model.onnx")
_ort_session = ort.InferenceSession(_onnx_path, providers=["CPUExecutionProvider"])
_ort_input_names = {i.name for i in _ort_session.get_inputs()}

def _mean_pooling(token_embeddings: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
    mask = attention_mask[..., None].astype(np.float32)
    summed = (token_embeddings * mask).sum(axis=1)
    counts = np.clip(mask.sum(axis=1), 1e-9, None)
    return summed / counts

def sbert_embed(texts: List[str]) -> np.ndarray:
    """L2-normalized sentence embeddings for a batch of texts -- cosine
    similarity between any two rows is just their dot product."""
    enc = _tokenizer(texts, padding=True, truncation=True, return_tensors="np")
    onnx_inputs = {k: v.astype(np.int64) for k, v in enc.items() if k in _ort_input_names}
    token_embeddings = _ort_session.run(None, onnx_inputs)[0]
    pooled = _mean_pooling(token_embeddings, enc["attention_mask"])
    norms = np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9, None)
    return pooled / norms

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
    # Pre-computed SBERT embeddings (384 floats, L2-normalized), cached by
    # Laravel in the projects table when a project's text is saved. When
    # present, /check skips re-encoding this archived entry's text entirely
    # -- only the new submission still needs a live encode. When absent
    # (legacy rows not yet backfilled), /check falls back to encoding the
    # raw text, same as before this cache existed.
    title_embedding:      Optional[List[float]] = None
    abstract_embedding:   Optional[List[float]] = None
    objectives_embedding: Optional[List[float]] = None

class CheckRequest(BaseModel):
    new_project: ProjectText
    archived:    List[ArchivedProject]
    use_sbert:   Optional[bool] = True   # ← Free plan sends False

class ExplainRequest(BaseModel):
    own_text:   str
    other_text: str

class EmbedRequest(BaseModel):
    title:      str
    abstract:   Optional[str] = ""
    objectives: Optional[str] = ""

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
    embs = sbert_embed([text_a, text_b])
    score = float(np.dot(embs[0], embs[1]))
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

def _batch_field_scores(new_text: str, old_texts: List[str], use_sbert: bool,
                         old_embeddings: Optional[List[Optional[List[float]]]] = None) -> List[float]:
    """
    Scores new_text against every text in old_texts for one field (title,
    abstract, or objectives).

    SBERT side: the new submission is always encoded live, exactly once
    (previously combined_similarity() re-encoded it from scratch for every
    archived entry). Each archived entry uses its cached embedding when
    old_embeddings[i] is given (the real fix for the archive-side cost,
    which used to be re-encoded on every single check regardless of
    whether the archive text had changed); only entries with no cached
    embedding yet (legacy rows) get batch-encoded live, in one call.

    TF-IDF side is unaffected -- fitting a 2-document TF-IDF per pair is
    cheap and was never the bottleneck, so it's still computed directly.
    """
    n = len(old_texts)
    if old_embeddings is None:
        old_embeddings = [None] * n

    new_emb = None
    if use_sbert and new_text.strip():
        new_emb = sbert_embed([new_text])[0]

    missing_idx = [
        i for i in range(n)
        if use_sbert and old_texts[i].strip() and not old_embeddings[i]
    ]
    live_embs = {}
    if missing_idx:
        encoded = sbert_embed([old_texts[i] for i in missing_idx])
        for row, i in enumerate(missing_idx):
            live_embs[i] = encoded[row]

    pre_new = preprocess(new_text)
    pre_old = [preprocess(t) for t in old_texts]

    scores = []
    for i in range(n):
        if not new_text.strip() or not old_texts[i].strip():
            scores.append(0.0)
            continue
        t_score = 0.0
        if use_sbert and new_emb is not None:
            vec = old_embeddings[i] if old_embeddings[i] else live_embs.get(i)
            if vec is not None:
                t_score = round(max(0.0, float(np.dot(new_emb, np.asarray(vec, dtype=np.float32)))) * 100, 2)
        f_score = 0.0
        if pre_new.strip() and pre_old[i].strip():
            try:
                vec2 = TfidfVectorizer()
                matrix = vec2.fit_transform([pre_new, pre_old[i]])
                f_score = round(float(sklearn_cosine(matrix[0], matrix[1])[0][0]) * 100, 2)
            except Exception:
                f_score = 0.0
        scores.append(round((t_score * 0.5) + (f_score * 0.5), 2) if use_sbert else f_score)
    return scores

@app.post("/check")
def check_similarity(req: CheckRequest):
    results = []

    title_scores      = _batch_field_scores(req.new_project.title,      [o.title or "" for o in req.archived],      req.use_sbert, [o.title_embedding for o in req.archived])
    abstract_scores   = _batch_field_scores(req.new_project.abstract or "",   [o.abstract or "" for o in req.archived],   req.use_sbert, [o.abstract_embedding for o in req.archived])
    objectives_scores = _batch_field_scores(req.new_project.objectives or "", [o.objectives or "" for o in req.archived], req.use_sbert, [o.objectives_embedding for o in req.archived])

    for i, old in enumerate(req.archived):
        title_score, abstract_score, objectives_score = title_scores[i], abstract_scores[i], objectives_scores[i]

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

@app.post("/embed")
def embed_project(req: EmbedRequest):
    """
    Computes and returns SBERT embeddings for a project's title/abstract/
    objectives, so Laravel can cache them on the projects row. Once cached,
    /check never needs to re-encode this project's text as an archived
    comparison target again -- only recomputed when the text itself changes.
    """
    texts = [req.title, req.abstract or "", req.objectives or ""]
    valid_idx = [i for i, t in enumerate(texts) if t.strip()]
    result: List[Optional[List[float]]] = [None, None, None]
    if valid_idx:
        embs = sbert_embed([texts[i] for i in valid_idx])
        for row, i in enumerate(valid_idx):
            result[i] = embs[row].tolist()
    return {
        "title_embedding":      result[0],
        "abstract_embedding":   result[1],
        "objectives_embedding": result[2],
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

    own_embs   = sbert_embed(own_segments)
    other_embs = sbert_embed(other_segments)
    sim_matrix = own_embs @ other_embs.T   # both L2-normalized -> this is cosine similarity

    segments = []
    for i, seg in enumerate(own_segments):
        best_idx   = int(sim_matrix[i].argmax())
        best_score = round(max(0.0, float(sim_matrix[i][best_idx])) * 100, 2)
        matched    = best_score >= SEMANTIC_MATCH_THRESHOLD
        segments.append({
            "text":         seg,
            "matched":      matched,
            "score":        best_score,
            "matched_with": other_segments[best_idx] if matched else None,
        })

    return {"segments": segments, "threshold": SEMANTIC_MATCH_THRESHOLD}




    # PS C:\xampp\htdocs\similarity-service> python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload