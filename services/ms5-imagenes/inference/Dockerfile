# Servicio de inferencia de radiografias (FastAPI + TensorFlow). Construccion desde la RAIZ del repo (necesita contracts/):
#   docker compose --profile inferencia build ms5-inference
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TF_CPP_MIN_LOG_LEVEL=2
WORKDIR /srv

# libgl/libglib: dependencias de opencv-python-headless en slim
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY services/ms5-imagenes/inference/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ms5-imagenes/inference/app ./app
COPY contracts/events/topology.json ./topology.json
ENV TOPOLOGY_FILE=/srv/topology.json MODEL_PATH=/models/pneumonia.keras

# Usuario sin privilegios
RUN useradd --create-home --uid 10001 inferencia
USER inferencia

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
