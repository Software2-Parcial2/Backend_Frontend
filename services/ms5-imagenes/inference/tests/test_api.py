import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.modelo import ModeloNoDisponible

from .conftest import dicom_bytes, imagen_bytes


def test_health_declara_que_el_modelo_es_ficticio(client):
    d = client.get("/health").json()
    assert d["status"] == "UP"
    assert d["modelo"] == "stub-no-clinico"
    assert d["clinico"] is False


def test_modelo_advierte_que_no_es_clinico(client):
    d = client.get("/modelo").json()
    assert "NO CLINICO" in d["advertencia"]
    assert "no es un diagnostico" in d["aviso"].lower()


@pytest.mark.parametrize("formato", ["PNG", "JPEG"])
def test_predict_devuelve_el_contrato_y_etiqueta_el_stub(client, formato):
    r = client.post("/predict", files={"file": ("rx.img", imagen_bytes(formato), "application/octet-stream")})
    assert r.status_code == 200
    d = r.json()
    assert set(d) == {"probabilidad_neumonia", "clase", "version_modelo", "modelo", "aviso"}
    assert 0.0 <= d["probabilidad_neumonia"] <= 1.0
    assert d["clase"] in ("NEUMONIA", "NORMAL")
    assert d["modelo"] == "stub-no-clinico"  # SIEMPRE visible mientras no haya modelo entrenado
    assert "apoyo a la decision" in d["aviso"].lower() and "no es un diagnostico" in d["aviso"].lower()


def test_predict_es_determinista_y_distingue_imagenes(client):
    a1 = client.post("/predict", files={"file": ("a.png", imagen_bytes(semilla=1))}).json()
    a2 = client.post("/predict", files={"file": ("a.png", imagen_bytes(semilla=1))}).json()
    b = client.post("/predict", files={"file": ("b.png", imagen_bytes(semilla=2))}).json()
    assert a1["probabilidad_neumonia"] == a2["probabilidad_neumonia"]
    assert a1["probabilidad_neumonia"] != b["probabilidad_neumonia"]


def test_predict_acepta_dicom(client):
    r = client.post("/predict", files={"file": ("rx.dcm", dicom_bytes())})
    assert r.status_code == 200, r.text
    assert r.json()["modelo"] == "stub-no-clinico"


def test_grad_cam_opcional_devuelve_un_png(client):
    sin = client.post("/predict", files={"file": ("a.png", imagen_bytes())}).json()
    assert "grad_cam" not in sin
    con = client.post("/predict?grad_cam=true", files={"file": ("a.png", imagen_bytes())}).json()
    png = Image.open(io.BytesIO(base64.b64decode(con["grad_cam"])))
    assert png.format == "PNG" and png.size == (64, 64)
    assert con["probabilidad_neumonia"] == sin["probabilidad_neumonia"]


@pytest.mark.parametrize("contenido", [b"", b"esto no es una imagen", b"<script>alert(1)</script>", b"%PDF-1.7 ..."])
def test_predict_rechaza_lo_que_no_es_imagen(client, contenido):
    r = client.post("/predict", files={"file": ("x.png", contenido)})
    assert r.status_code == 400


def test_predict_rechaza_imagenes_demasiado_grandes(settings):
    pequeno = settings.model_copy(update={"max_image_bytes": 500})
    with TestClient(create_app(pequeno)) as c:
        assert c.post("/predict", files={"file": ("a.png", imagen_bytes(tam=128))}).status_code == 413


def test_api_key_si_esta_configurada(settings):
    protegido = settings.model_copy(update={"inference_api_key": "secreta"})
    with TestClient(create_app(protegido)) as c:
        f = {"file": ("a.png", imagen_bytes())}
        assert c.post("/predict", files=f).status_code == 401
        assert c.post("/predict", files=f, headers={"X-Api-Key": "mala"}).status_code == 401
        assert c.post("/predict", files=f, headers={"X-Api-Key": "secreta"}).status_code == 200
        assert c.get("/health").status_code == 200  # la salud no exige clave


def test_sin_modelo_y_sin_permiso_de_stub_no_arranca(settings):
    estricto = settings.model_copy(update={"allow_stub": False})
    with pytest.raises(ModeloNoDisponible):
        with TestClient(create_app(estricto)):
            pass
