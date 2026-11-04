# Used by Railway (and originally built for Google Cloud Run, which this
# project ultimately didn't use). Render runs this service as native
# Python instead of via this Dockerfile, so changes here only affect
# Railway/Cloud-Run-style deployments.
#
# Both platforms inject the PORT env var at runtime (default 8080) -- the
# shell-form CMD below (not JSON-array form) is required so that variable
# actually expands.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m spacy download en_core_web_sm

COPY main.py .

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
