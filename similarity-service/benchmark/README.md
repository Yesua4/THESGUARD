# ThesisGuard Similarity Detection — Benchmark Evaluation

This folder contains the actual code and data behind the Precision/Recall/F1/Accuracy
figures reported in the manuscript (Tables 17, 18, and 19).

## Why a constructed corpus

ThesisGuard's own institutional archive does not yet contain enough approved projects
for a statistically meaningful benchmark. Rather than leave the evaluation tables blank
or fabricate numbers, this benchmark was built from a **constructed evaluation corpus**:
121 synthetic capstone/thesis project descriptions (title, abstract, objectives) modeled
on common Philippine IT/CS capstone topics. This is disclosed as such in the manuscript
— it is explicitly *not* presented as ThesisGuard's own historical archive.

## How ground truth was established

- **15 topics** are each written in **two independently-paraphrased versions** (different
  sentence structure, synonym choices, framing) — these form 15 **known-duplicate** pairs.
- **15 additional pairs** were drawn from the remaining, topically distinct entries — these
  form 15 **known-distinct** pairs.
- Together: **30 labeled test pairs**, evaluated at the system's real production threshold
  (overall score ≥ 60% ⇒ automatically flagged for mandatory review).

## Files

| File | What it is |
|---|---|
| `build_corpus.py` | Generates `corpus.json` — the 121-entry corpus and the list of known-duplicate pairs. |
| `corpus.json` | The generated corpus (deterministic — `random.seed(42)`). |
| `run_benchmark.py` | Imports `tfidf_similarity`, `sbert_similarity`, and `combined_similarity` **directly from `../main.py`** (the real production code, unmodified) and scores all 30 test pairs under three methods: TF-IDF-only, SBERT-only, and the production Hybrid (50% TF-IDF + 50% SBERT). |
| `results.json` | Precision/Recall/F1/Accuracy per method — this is what Table 18 reports. |
| `hybrid_pairs.json` | Per-pair scores and predictions for the Hybrid method — this is what Table 19's confusion matrix is built from. |

## How to reproduce

```bash
cd similarity-service/benchmark
python build_corpus.py     # regenerates corpus.json (deterministic)
python run_benchmark.py    # runs the real pipeline, prints + saves results.json / hybrid_pairs.json
```

No data is written to the production database — this runs entirely in-memory against the
JSON corpus above, calling the same similarity functions the live FastAPI service uses.

## Headline result (production Hybrid method, n=30, threshold=60%)

| | Predicted: Similar | Predicted: Not Similar |
|---|---|---|
| **Actual: Similar** | TP = 6 | FN = 9 |
| **Actual: Not Similar** | FP = 0 | TN = 15 |

Precision = 100%, Recall = 40%, F1 = 57.1%, Accuracy = 70%.

Note: all 15 known-duplicate pairs scored above 50%, so none were missed entirely under
ThesisGuard's real three-tier design (Low / Moderate / High) — the 9 "false negatives"
at the strict 60% cutoff still land in the Moderate tier, which routes to adviser review
rather than silently approving the submission. See Chapter 2 of the manuscript for the
full discussion, including the comparison against SBERT-only (100% across all metrics)
and TF-IDF-only (0% recall) at the same threshold.
