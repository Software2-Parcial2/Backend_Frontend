# MS7 Whisper (FastAPI + faster-whisper, CPU). Construccion desde la RAIZ del repo:
#   docker compose --profile ml build ms7-whisper
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models/hf
WORKDIR /srv
COPY services/ms7-inteligencia/whisper/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ms7-inteligencia/whisper/app ./app
# El modelo se descarga la primera vez en el volumen /models (persistente). faster-whisper decodifica con PyAV (incluye ffmpeg).
RUN useradd --create-home --uid 10001 whisper && mkdir -p /models/hf && chown -R whisper /models
USER whisper
EXPOSE 8017
HEALTHCHECK --interval=20s --timeout=5s --retries=10 --start-period=120s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8017/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8017"]
