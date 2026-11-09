from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

AVISO = (
    "Resultado generado por un modelo de IA como apoyo a la decision clinica. No es un diagnostico. "
    "Proyecto academico: no usar en pacientes reales."
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Modelo: archivo .keras entrenado (ml/pneumonia/train.py). Si no existe y ALLOW_STUB=true se usa un modelo FICTICIO NO CLINICO.
    model_path: Path = Path("models/pneumonia.keras")
    allow_stub: bool = True
    max_image_bytes: int = 15 * 1024 * 1024
    # Si se define, /predict exige la cabecera X-Api-Key (el servicio es interno; no pasa por el gateway).
    inference_api_key: str | None = None

    # RabbitMQ
    rabbitmq_user: str = "sigec"
    rabbitmq_password: str = "cambia_esto"
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_url: str | None = None
    topology_file: Path = (Path(__file__).resolve().parents[4] if len(Path(__file__).resolve().parents) > 4 else Path("/")) / "contracts" / "events" / "topology.json"
    enable_consumer: bool = True
    consumer_prefetch: int = 2
    queue_name: str = "ms5.inferencia.comandos"

    # S3 (SeaweedFS en desarrollo)
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    aws_region: str = "sa-east-1"

    @property
    def amqp_url(self) -> str:
        from urllib.parse import quote

        return self.rabbitmq_url or (
            f"amqp://{quote(self.rabbitmq_user)}:{quote(self.rabbitmq_password)}@{self.rabbitmq_host}:{self.rabbitmq_port}/"
        )


def get_settings() -> Settings:
    return Settings()
