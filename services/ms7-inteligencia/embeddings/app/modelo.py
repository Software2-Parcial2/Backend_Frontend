from __future__ import annotations

from typing import Protocol


class Codificador(Protocol):
    nombre: str
    dimension: int

    def codificar(self, textos: list[str]) -> list[list[float]]: ...


class SentenceTransformersCodificador:
    """Carga el modelo una vez (descarga de Hugging Face la primera vez) y devuelve vectores L2-normalizados:
    el producto punto equivale a la similitud coseno."""

    def __init__(self, nombre: str):
        from sentence_transformers import SentenceTransformer

        self.nombre = nombre
        self._m = SentenceTransformer(nombre)
        self.dimension = int(self._m.get_embedding_dimension() or len(self._m.encode(["x"])[0]))

    def codificar(self, textos: list[str]) -> list[list[float]]:
        return self._m.encode(textos, normalize_embeddings=True, batch_size=32, show_progress_bar=False).tolist()
