from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[4]  # raiz del monorepo (en Docker se sobreescribe por entorno)

AVISO = (
    "Prediccion estadistica de apoyo a la gestion (no clinica). Se calcula solo con atributos administrativos "
    "y no debe usarse para negar o condicionar la atencion de un paciente. Proyecto academico."
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    no_show_model_path: Path = RAIZ / "ml" / "no-show" / "models" / "no-show.joblib"
    segmentos_path: Path = RAIZ / "ml" / "demanda" / "models" / "segmentos.json"
    # Si se define, los endpoints exigen la cabecera X-Api-Key (servicio interno: solo lo llama la API de MS7).
    ml_api_key: str | None = None
    max_lote: int = 500


settings = Settings()
