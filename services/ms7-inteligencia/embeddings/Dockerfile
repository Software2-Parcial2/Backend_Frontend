# MS7 embeddings (FastAPI + sentence-transformers, CPU). Construccion desde la RAIZ del repo:
#   docker compose --profile ml build ms7-embeddings
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models/hf
WORKDIR /srv
COPY services/ms7-inteligencia/embeddings/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ms7-inteligencia/embeddings/app ./app
# El modelo se descarga la primera vez en el volumen /models (persistente); no va en la imagen.
RUN useradd --create-home --uid 10001 emb && mkdir -p /models/hf && chown -R emb /models
USER emb
EXPOSE 8027
HEALTHCHECK --interval=20s --timeout=5s --retries=10 --start-period=90s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8027/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8027"]
