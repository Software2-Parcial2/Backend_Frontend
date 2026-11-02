from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Modelo multilingue (espanol incluido), 384 dimensiones. Cambiarlo exige una migracion nueva en MS7 (vector(384)).
    embeddings_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    # Si se define, /embed exige la cabecera X-Api-Key (servicio interno; no pasa por el gateway).
    embeddings_api_key: str | None = None
    max_textos: int = 64
    max_caracteres: int = 2000


settings = Settings()
