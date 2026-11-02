"""Descarga de imagenes desde S3 (SeaweedFS en desarrollo)."""

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import Settings


class ObjetoNoEncontrado(Exception):
    pass


class AlmacenS3:
    def __init__(self, s: Settings):
        self._cliente = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint,
            region_name=s.aws_region,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, connect_timeout=5, read_timeout=30, retries={"max_attempts": 2}),
        )

    def descargar(self, bucket: str, key: str) -> bytes:
        """Bloqueante (se llama con asyncio.to_thread). Lanza ObjetoNoEncontrado si no existe; cualquier otro error es de infraestructura."""
        try:
            return self._cliente.get_object(Bucket=bucket, Key=key)["Body"].read()
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NoSuchBucket"):
                raise ObjetoNoEncontrado(f"{bucket}/{key}") from e
            raise
