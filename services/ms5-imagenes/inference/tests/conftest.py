import io
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app


def imagen_bytes(formato: str = "PNG", semilla: int = 0, tam: int = 64) -> bytes:
    rng = np.random.default_rng(semilla)
    img = Image.fromarray(rng.integers(0, 255, (tam, tam, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format=formato)
    return buf.getvalue()


def dicom_bytes() -> bytes:
    import pydicom
    from pydicom.dataset import FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.Rows = ds.Columns = 32
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.PixelData = (np.arange(32 * 32, dtype=np.uint16) % 4096).tobytes()
    buf = io.BytesIO()
    ds.save_as(buf, enforce_file_format=True)
    return buf.getvalue()


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(enable_consumer=False, allow_stub=True, model_path=Path("/no/existe.keras"))


@pytest.fixture(scope="session")
def client(settings):
    with TestClient(create_app(settings)) as c:  # el modelo ficticio se construye una sola vez
        yield c
