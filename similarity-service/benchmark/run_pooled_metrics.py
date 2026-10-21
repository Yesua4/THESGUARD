# -*- coding: utf-8 -*-
"""
Pooled (whole-corpus) metrics for the extended 47-pair benchmark, with 95%
confidence intervals, in response to the panel's concern that SBERT's 100%
in the original benchmark looked like overfitting.

Why pooled: nothing in the pipeline is trained or tuned on this corpus
(all-MiniLM-L6-v2 is used pretrained; the 60% threshold and 50/50 and
40/35/25 weights are the fixed production values from main.py). With no
fitting step, the dev/val/test split in run_benchmark_v2.py does not guard
against anything, and its small splits (9 and 6 pairs) give unstable
percentages. Scoring all 47 pairs together gives the largest sample, and the
Wilson intervals show how much (or how little) a perfect score on a small
sample actually proves.

The 47 pairs are rebuilt exactly as run_benchmark_v2.py builds them (same
seed, same construction), and scored with the production functions imported
from ../main.py. Writes results_pooled.json.
"""
import sys, os, json, math, random, importlib.util
random.seed(7)  # must match run_benchmark_v2.py so the easy-negative pairs are identical

BENCHMARK_DIR = os.path.dirname(os.path.abspath(__file__))
SIM_SERVICE_DIR = os.path.dirname(BENCHMARK_DIR)
sys.path.insert(0, SIM_SERVICE_DIR)

spec = importlib.util.spec_from_file_location("main", os.path.join(SIM_SERVICE_DIR, "main.py"))
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)

with open(os.path.join(BENCHMARK_DIR, "corpus.json"), encoding="utf-8") as f:
    synth = json.load(f)
with open(os.path.join(BENCHMARK_DIR, "real_hard_negatives.json"), encoding="utf-8") as f:
    real = json.load(f)

all_docs = {d["id"]: d for d in synth["corpus"]}
all_docs.update({d["id"]: d for d in real["docs"]})

# --- same pair construction as run_benchmark_v2.py ---
duplicate_pairs = [(a, b) for a, b, _topic in synth["positive_pairs"]]
positive_ids = {i for pair in duplicate_pairs for i in pair}
unique_ids = [d["id"] for d in synth["corpus"] if d["id"] not in positive_ids]
random.shuffle(unique_ids)
easy_negative_pairs = []
i = 0
while len(easy_negative_pairs) < len(real["hard_negative_pairs"]) and i + 1 < len(unique_ids):
    easy_negative_pairs.append((unique_ids[i], unique_ids[i + 1]))
    i += 2
hard_negative_pairs = [(a, b) for a, b in real["hard_negative_pairs"]]

PAIRS = ([(a, b, True, "duplicate") for a, b in duplicate_pairs]
         + [(a, b, False, "easy_negative") for a, b in easy_negative_pairs]
         + [(a, b, False, "hard_negative") for a, b in hard_negative_pairs])

WEIGHTS = {"title": 0.40, "abstract": 0.35, "objectives": 0.25}
THRESHOLD = 60.0


def overall_score(method, doc_a, doc_b):
    total = 0.0
    for field, w in WEIGHTS.items():
        text_a = doc_a.get(field, "") or ""
        text_b = doc_b.get(field, "") or ""
        if method == "tfidf":
            s = main.tfidf_similarity(text_a, text_b)
        elif method == "sbert":
            s = main.sbert_similarity(text_a, text_b)
        else:
            s = main.combined_similarity(text_a, text_b, use_sbert=True)
        total += s * w
    return round(total, 2)


def wilson(k, n, z=1.96):
    """95% Wilson score interval for k successes out of n, in percent."""
    if n == 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [round(max(0.0, centre - half) * 100, 1), round(min(1.0, centre + half) * 100, 1)]


def metric(k, n):
    return {"value": round(k / n * 100, 1) if n else None, "k": k, "n": n, "ci95": wilson(k, n)}


output = {"n_pairs": len(PAIRS), "threshold": THRESHOLD, "methods": {}}
for method in ["tfidf", "sbert", "hybrid"]:
    tp = fp = tn = fn = 0
    by_type = {}
    rows = []
    for a_id, b_id, is_similar, label in PAIRS:
        score = overall_score(method, all_docs[a_id], all_docs[b_id])
        predicted = score >= THRESHOLD
        correct = predicted == is_similar
        t = by_type.setdefault(label, {"n": 0, "correct": 0, "flagged": 0})
        t["n"] += 1
        t["correct"] += correct
        t["flagged"] += predicted
        rows.append({"a_id": a_id, "b_id": b_id, "label": label, "score": score, "predicted_similar": predicted})
        if is_similar and predicted: tp += 1
        elif not is_similar and predicted: fp += 1
        elif not is_similar and not predicted: tn += 1
        else: fn += 1

    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)) if precision and recall else 0.0
    output["methods"][method] = {
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": metric(tp, tp + fp),
        "recall": metric(tp, tp + fn),
        "specificity": metric(tn, tn + fp),
        "accuracy": metric(tp + tn, len(PAIRS)),
        "f1": round(f1 * 100, 1),
        "by_pair_type": by_type,
        "rows": rows,
    }
    m = output["methods"][method]

    def fmt(x):
        return "n/a (no pairs flagged)" if x["value"] is None else f"{x['value']}% [{x['ci95'][0]}-{x['ci95'][1]}]"

    print(f"\n{method.upper()}  TP={tp} FP={fp} TN={tn} FN={fn}")
    for name in ["precision", "recall", "specificity", "accuracy"]:
        print(f"  {name:12s} {fmt(m[name])}")
    print(f"  {'f1':12s} {m['f1']}%")
    for label, t in by_type.items():
        print(f"  {label:14s} {t['correct']}/{t['n']} correct, {t['flagged']} flagged as similar")

with open(os.path.join(BENCHMARK_DIR, "results_pooled.json"), "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)
print("\nSaved results_pooled.json")
