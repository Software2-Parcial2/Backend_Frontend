# MS7 ML (FastAPI + scikit-learn). Construccion desde la RAIZ del repo:
#   docker compose --profile ml build ms7-ml
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY services/ms7-inteligencia/ml/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ms7-inteligencia/ml/app ./app
# Los modelos se montan como volumen (no van en la imagen): ver docker-compose.yml
ENV NO_SHOW_MODEL_PATH=/models/no-show/no-show.joblib SEGMENTOS_PATH=/models/demanda/segmentos.json
RUN useradd --create-home --uid 10001 ml
USER ml
EXPOSE 8007
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8007/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8007"]
