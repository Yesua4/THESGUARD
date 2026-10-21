# -*- coding: utf-8 -*-
"""
Extended benchmark, built in response to panel feedback on the original
30-pair evaluation (Tables 18-19 in the manuscript):

  1. The original negative pairs were all "easy negatives" -- topically
     unrelated projects, which any method separates trivially. This script
     adds REAL "hard negative" pairs: genuine, different papers fetched live
     from the arXiv public API, each pair on a closely related sub-topic
     (e.g. two different real papers on attendance systems, one RFID-based
     and one face-recognition-based). See real_hard_negatives.json for the
     verbatim real titles/abstracts and their arXiv IDs.
  2. The corpus is split 70/20/10 (dev/val/test), stratified by pair type
     (duplicate / easy-negative / hard-negative) so each split has all three
     kinds represented. The system's production thresholds and weights are
     NOT re-tuned here -- they're the same fixed values already shipped in
     main.py -- but the split still matters: it proves the reported test
     numbers weren't cherry-picked from the same data used to sanity-check
     the pipeline, which was the panel's second concern.

Calls tfidf_similarity / sbert_similarity / combined_similarity directly
from ../main.py (the real production code, unmodified). No fabricated
numbers -- every score below is computed by the real pipeline.
"""
import sys, os, json, random, importlib.util
random.seed(7)

BENCHMARK_DIR = os.path.dirname(os.path.abspath(__file__))
SIM_SERVICE_DIR = os.path.dirname(BENCHMARK_DIR)
sys.path.insert(0, SIM_SERVICE_DIR)

spec = importlib.util.spec_from_file_location("main", os.path.join(SIM_SERVICE_DIR, "main.py"))
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)  # loads spacy/sbert models once

# ---------------------------------------------------------------------------
# Load the two data sources
# ---------------------------------------------------------------------------
with open(os.path.join(BENCHMARK_DIR, "corpus.json"), encoding="utf-8") as f:
    synth = json.load(f)
with open(os.path.join(BENCHMARK_DIR, "real_hard_negatives.json"), encoding="utf-8") as f:
    real = json.load(f)

synth_corpus = {d["id"]: d for d in synth["corpus"]}
real_corpus = {d["id"]: d for d in real["docs"]}

all_docs = {}
all_docs.update(synth_corpus)
all_docs.update(real_corpus)

# duplicate pairs (ground truth: SIMILAR) -- same as the original benchmark
duplicate_pairs = [(a, b) for a, b, _topic in synth["positive_pairs"]]

# easy-negative pairs (ground truth: NOT SIMILAR, unrelated topics) -- same
# construction as the original benchmark, but capped to match the other
# two categories' size for a balanced, evenly-stratified corpus.
positive_ids = set()
for a, b in duplicate_pairs:
    positive_ids.add(a); positive_ids.add(b)
unique_ids = [d["id"] for d in synth["corpus"] if d["id"] not in positive_ids]
random.shuffle(unique_ids)
easy_negative_pairs = []
i = 0
while len(easy_negative_pairs) < len(real["hard_negative_pairs"]) and i + 1 < len(unique_ids):
    easy_negative_pairs.append((unique_ids[i], unique_ids[i + 1]))
    i += 2

# hard-negative pairs (ground truth: NOT SIMILAR, but topically related --
# REAL papers, see real_hard_negatives.json)
hard_negative_pairs = [(a, b) for a, b in real["hard_negative_pairs"]]

print(f"Duplicate pairs:      {len(duplicate_pairs)}")
print(f"Easy-negative pairs:  {len(easy_negative_pairs)}")
print(f"Hard-negative pairs:  {len(hard_negative_pairs)}  (real arXiv papers)")

# ---------------------------------------------------------------------------
# Stratified 70/20/10 split -- split EACH category separately, then combine,
# so dev/val/test each contain duplicate + easy-negative + hard-negative
# pairs in roughly the same proportion as the whole corpus.
# ---------------------------------------------------------------------------
def stratified_split(pairs, label):
    pairs = list(pairs)
    random.shuffle(pairs)
    n = len(pairs)
    n_test = max(1, round(n * 0.10))
    n_val = max(1, round(n * 0.20))
    n_dev = n - n_test - n_val
    dev  = [(a, b, label) for a, b in pairs[:n_dev]]
    val  = [(a, b, label) for a, b in pairs[n_dev:n_dev + n_val]]
    test = [(a, b, label) for a, b in pairs[n_dev + n_val:]]
    return dev, val, test

dev, val, test = [], [], []
for pairs, label, is_similar in [
    (duplicate_pairs, "duplicate", True),
    (easy_negative_pairs, "easy_negative", False),
    (hard_negative_pairs, "hard_negative", False),
]:
    d, v, t = stratified_split(pairs, label)
    dev += [(a, b, is_similar, label) for a, b, label in d]
    val += [(a, b, is_similar, label) for a, b, label in v]
    test += [(a, b, is_similar, label) for a, b, label in t]

random.shuffle(dev); random.shuffle(val); random.shuffle(test)

print(f"\nSplit sizes -- dev: {len(dev)}, val: {len(val)}, test: {len(test)}")
for name, split in [("dev", dev), ("val", val), ("test", test)]:
    counts = {}
    for _, _, _, label in split:
        counts[label] = counts.get(label, 0) + 1
    print(f"  {name}: {counts}")

# ---------------------------------------------------------------------------
# Scoring (real pipeline, unchanged weights/threshold from production)
# ---------------------------------------------------------------------------
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

def evaluate(split, method):
    tp = fp = tn = fn = 0
    rows = []
    for a_id, b_id, is_similar, label in split:
        a, b = all_docs[a_id], all_docs[b_id]
        score = overall_score(method, a, b)
        predicted = score >= THRESHOLD
        rows.append({"a_id": a_id, "b_id": b_id, "label": label, "true_similar": is_similar,
                      "predicted_similar": predicted, "score": score})
        if is_similar and predicted: tp += 1
        elif not is_similar and predicted: fp += 1
        elif not is_similar and not predicted: tn += 1
        else: fn += 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    accuracy = (tp + tn) / len(split) if split else 0.0
    return {
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": round(precision * 100, 1), "recall": round(recall * 100, 1),
        "f1": round(f1 * 100, 1), "accuracy": round(accuracy * 100, 1),
        "n": len(split), "rows": rows,
    }

output = {"split_sizes": {"dev": len(dev), "val": len(val), "test": len(test)}, "splits": {}}
for split_name, split in [("dev", dev), ("val", val), ("test", test)]:
    output["splits"][split_name] = {}
    print(f"\n{'='*60}\n{split_name.upper()} SET (n={len(split)})\n{'='*60}")
    for method in ["tfidf", "sbert", "hybrid"]:
        r = evaluate(split, method)
        output["splits"][split_name][method] = {k: v for k, v in r.items() if k != "rows"}
        print(f"  {method.upper():8s}  TP={r['tp']} FP={r['fp']} TN={r['tn']} FN={r['fn']}  "
              f"Precision={r['precision']}%  Recall={r['recall']}%  F1={r['f1']}%  Accuracy={r['accuracy']}%")

# Save the test set's row-level hybrid detail for the manuscript's confusion matrix / worked examples
test_hybrid_rows = evaluate(test, "hybrid")["rows"]
output["test_hybrid_rows"] = test_hybrid_rows

with open(os.path.join(BENCHMARK_DIR, "results_v2.json"), "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

print("\nSaved results_v2.json")
