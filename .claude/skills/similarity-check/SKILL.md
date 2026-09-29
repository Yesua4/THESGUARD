---
name: similarity-check
description: Run, test, or change ThesisGuard's similarity-service (the FastAPI TF-IDF + SBERT duplicate-topic checker), then re-run the benchmark so the manuscript's Precision/Recall/F1 stay accurate. Use when the user asks to start the similarity service, test how similar two titles or abstracts are, change weights or thresholds, or debug similarity scores.
---

# ThesisGuard similarity service

Code: `similarity-service/main.py`. Laravel calls it through `SIMILARITY_SERVICE_URL`
(default `http://localhost:8001`) from `app/Services/SimilarityService.php` and
`SimilarityController`.

## How scoring works (read before changing anything)

| Setting | Value | Where |
|---|---|---|
| Per-field score | 50% TF-IDF + 50% SBERT cosine (TF-IDF only when `use_sbert=false`) | `combined_similarity()` |
| Overall | title 40% + abstract 35% + objectives 25% | `/check` |
| Match cutoff | overall > 5 is returned | `/check` |
| Review bands | < 30 green, 30-59 amber, ≥ 60 red (mandatory review) | `TECHNO-FRONTEND/src/utils/similarityColors.js` |
| Explain segment match | ≥ 55 | `SEMANTIC_MATCH_THRESHOLD` |

Text is lowercased, stripped of punctuation, stop-word filtered (NLTK), and lemmatized (spaCy).

## Start the service

```bash
cd similarity-service
pip install -r requirements.txt
python -m spacy download en_core_web_sm      # first time only
python -m nltk.downloader stopwords          # first time only
uvicorn main:app --port 8001 --reload
```

The first request is slow because SBERT loads. `GET http://localhost:8001/` should return
`{"status": "ThesisGuard similarity service running"}`.

## Try two projects quickly

```bash
curl -s -X POST http://localhost:8001/check -H "Content-Type: application/json" -d '{
  "new_project": {"title": "Library Management System with RFID", "abstract": "...", "objectives": "..."},
  "archived": [{"id": 1, "title": "RFID-Based Library Attendance and Borrowing System", "abstract": "...", "objectives": "..."}],
  "use_sbert": true
}'
```

Report `overall_score` and each field score. Say whether it is above the 60% review threshold.

## Changing weights or thresholds

1. Edit `main.py`. If you change the 30/60 bands, edit `src/utils/similarityColors.js`
   and any page text that mentions the numbers (search `TECHNO-FRONTEND/src` for `60%`).
2. Re-run the benchmark. It imports the scoring functions straight from `main.py`:
   ```bash
   cd similarity-service/benchmark
   python run_benchmark.py        # original 30-pair set  -> results.json
   python run_benchmark_v2.py     # adds real hard negatives -> results_v2.json
   ```
3. Compare the new Precision/Recall/F1/Accuracy with the old `results*.json` and show the
   user a before/after table.
4. Tell the user that manuscript Tables 17-19 must be updated to match. Don't edit the
   `.docx` unless they ask.

## Debugging odd scores

- Very low score on obviously similar text: check whether `use_sbert` was false (the free
  plan sends false, so only TF-IDF is used, and TF-IDF misses paraphrases).
- Empty field: `tfidf_similarity` returns 0.0 when preprocessing leaves nothing, and that
  field drags the weighted overall down.
- Service unreachable from Laravel: check `SIMILARITY_SERVICE_URL` in `TECHNO-BACKEND/.env`,
  then run `php artisan config:clear`.
