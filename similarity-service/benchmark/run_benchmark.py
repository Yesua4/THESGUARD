# -*- coding: utf-8 -*-
"""
Runs the REAL ThesisGuard similarity-service functions (imported directly from
main.py, no fabricated numbers) against a labeled test set built from the
synthetic 121-document corpus, and computes real Precision/Recall/F1/Accuracy
for three methods: TF-IDF only, SBERT only, and the Hybrid (50/50) approach
actually used in production.
"""
import sys, os, json, random, importlib.util
random.seed(7)

BENCHMARK_DIR = os.path.dirname(os.path.abspath(__file__))
SIM_SERVICE_DIR = os.path.dirname(BENCHMARK_DIR)
sys.path.insert(0, SIM_SERVICE_DIR)

spec = importlib.util.spec_from_file_location("main", os.path.join(SIM_SERVICE_DIR, "main.py"))
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)  # loads spacy/sbert models once

with open(os.path.join(BENCHMARK_DIR, "corpus.json"), encoding="utf-8") as f:
    data = json.load(f)

corpus = {d["id"]: d for d in data["corpus"]}
positive_pairs = [(a, b) for a, b, _topic in data["positive_pairs"]]

# ---- build negative pairs: distinct topics not already paired as positives ----
positive_ids = set()
for a, b in positive_pairs:
    positive_ids.add(a); positive_ids.add(b)

# prefer using the "unique topic" docs (ids after the 30 paired ones) for negatives
unique_ids = [d["id"] for d in data["corpus"] if d["id"] not in positive_ids]
random.shuffle(unique_ids)
negative_pairs = []
used = set()
i = 0
while len(negative_pairs) < 15 and i + 1 < len(unique_ids):
    a, b = unique_ids[i], unique_ids[i + 1]
    negative_pairs.append((a, b))
    i += 2

print(f"Positive pairs: {len(positive_pairs)}, Negative pairs: {len(negative_pairs)}")

test_pairs = [(a, b, True) for a, b in positive_pairs] + [(a, b, False) for a, b in negative_pairs]
random.shuffle(test_pairs)

WEIGHTS = {"title": 0.40, "abstract": 0.35, "objectives": 0.25}
THRESHOLD = 60.0  # real "High Similarity" cutoff used in SimilarityBreakdown.jsx / demo_simulation.py

def field_score(method, text_a, text_b):
    if method == "tfidf":
        return main.tfidf_similarity(text_a, text_b)
    elif method == "sbert":
        return main.sbert_similarity(text_a, text_b)
    elif method == "hybrid":
        return main.combined_similarity(text_a, text_b, use_sbert=True)

def overall_score(method, doc_a, doc_b):
    total = 0.0
    for field, w in WEIGHTS.items():
        s = field_score(method, doc_a.get(field, "") or "", doc_b.get(field, "") or "")
        total += s * w
    return round(total, 2)

results = {}
for method in ["tfidf", "sbert", "hybrid"]:
    tp = fp = tn = fn = 0
    rows = []
    for a_id, b_id, is_similar in test_pairs:
        a, b = corpus[a_id], corpus[b_id]
        score = overall_score(method, a, b)
        predicted_similar = score >= THRESHOLD
        rows.append((a_id, b_id, is_similar, predicted_similar, score))
        if is_similar and predicted_similar: tp += 1
        elif not is_similar and predicted_similar: fp += 1
        elif not is_similar and not predicted_similar: tn += 1
        elif is_similar and not predicted_similar: fn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall    = tp / (tp + fn) if (tp + fn) else 0.0
    f1        = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    accuracy  = (tp + tn) / len(test_pairs)

    results[method] = {
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": round(precision * 100, 1),
        "recall": round(recall * 100, 1),
        "f1": round(f1 * 100, 1),
        "accuracy": round(accuracy * 100, 1),
        "rows": rows,
    }
    print(f"\n=== {method.upper()} ===")
    print(f"TP={tp} FP={fp} TN={tn} FN={fn}")
    print(f"Precision={results[method]['precision']}%  Recall={results[method]['recall']}%  F1={results[method]['f1']}%  Accuracy={results[method]['accuracy']}%")

with open(os.path.join(BENCHMARK_DIR, "results.json"), "w", encoding="utf-8") as f:
    json.dump({m: {k: v for k, v in r.items() if k != "rows"} for m, r in results.items()}, f, indent=2)

# Save detailed rows for the hybrid method (used for the manuscript's confusion matrix / worked example)
with open(os.path.join(BENCHMARK_DIR, "hybrid_pairs.json"), "w", encoding="utf-8") as f:
    rows_out = [{"a_id": a, "b_id": b, "a_title": corpus[a]["title"], "b_title": corpus[b]["title"],
                 "true_similar": ts, "predicted_similar": ps, "score": sc}
                for a, b, ts, ps, sc in results["hybrid"]["rows"]]
    json.dump(rows_out, f, indent=2)

print("\nSaved results.json and hybrid_pairs.json")
