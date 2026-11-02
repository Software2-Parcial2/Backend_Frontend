from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Modelo de faster-whisper: tiny | base | small | medium ... (mas grande = mejor y mas lento). `small` (~460 MB) da resultados aceptables en espanol
    # en CPU; `base` es mas rapido pero confunde palabras. Se descarga la primera vez.
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    idioma_por_defecto: str = "es"
    max_audio_bytes: int = 10 * 1024 * 1024
    max_duracion_s: float = 60.0
    # Transcripciones simultaneas (cada una usa varios hilos de CPU).
    concurrencia: int = 1
    # Si se define, /transcribir exige la cabecera X-Api-Key (servicio interno: solo lo llama MS7, nunca el navegador).
    whisper_api_key: str | None = None


settings = Settings()
