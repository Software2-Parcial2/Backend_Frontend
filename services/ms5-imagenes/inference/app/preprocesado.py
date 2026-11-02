"""Decodificacion de imagenes (JPEG, PNG, DICOM simple) a un tensor float32 [0, 255] RGB de 224x224."""

import io

import numpy as np
from PIL import Image, UnidentifiedImageError

TAMANO = (224, 224)


class ImagenInvalida(ValueError):
    """La imagen no se puede decodificar o no es soportada (error de negocio: no se reintenta)."""


def _es_dicom(datos: bytes) -> bool:
    return len(datos) >= 132 and datos[128:132] == b"DICM"


def _desde_dicom(datos: bytes) -> Image.Image:
    try:
        import pydicom

        ds = pydicom.dcmread(io.BytesIO(datos))
        px = ds.pixel_array.astype(np.float32)
    except Exception as e:  # noqa: BLE001 - cualquier fallo de lectura es un DICOM invalido para nosotros
        raise ImagenInvalida(f"DICOM no legible: {e}") from e
    if px.ndim == 3 and px.shape[-1] not in (3, 4):  # multiframe: primer corte
        px = px[0]
    if px.ndim == 3:
        px = px[..., :3].mean(axis=-1)
    lo, hi = float(px.min()), float(px.max())
    px = np.zeros_like(px) if hi <= lo else (px - lo) / (hi - lo) * 255.0  # ventana simple: min-max
    if str(getattr(ds, "PhotometricInterpretation", "")) == "MONOCHROME1":
        px = 255.0 - px
    return Image.fromarray(px.astype(np.uint8), mode="L")


def cargar_imagen(datos: bytes) -> Image.Image:
    """Abre la imagen como RGB. Lanza ImagenInvalida si no es una imagen valida."""
    if not datos:
        raise ImagenInvalida("el archivo esta vacio")
    try:
        if _es_dicom(datos):
            img = _desde_dicom(datos)
        else:
            img = Image.open(io.BytesIO(datos))
            img.load()
    except ImagenInvalida:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        raise ImagenInvalida(f"no es una imagen valida: {e}") from e
    return img.convert("RGB")


def a_tensor(img: Image.Image) -> np.ndarray:
    """(1, 224, 224, 3) float32 con valores en [0, 255]; el modelo incluye su propio reescalado."""
    redim = img.resize(TAMANO, Image.Resampling.BILINEAR)
    return np.asarray(redim, dtype=np.float32)[None, ...]
