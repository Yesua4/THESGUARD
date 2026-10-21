# For Google Cloud Run. Render's free tier (512MB) can't fit
# sentence-transformers even after trimming torch/spaCy; Cloud Run's free
# tier allows a much higher memory ceiling (billed only for actual usage,
# GB-seconds, with a generous always-free monthly allowance) and scales to
# zero when idle, same as Render's free tier does.
#
# Cloud Run injects the PORT env var at runtime (default 8080) -- the
# shell-form CMD below (not JSON-array form) is required so that variable
# actually expands.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m spacy download en_core_web_sm \
    && python -m nltk.downloader stopwords

COPY main.py .

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
