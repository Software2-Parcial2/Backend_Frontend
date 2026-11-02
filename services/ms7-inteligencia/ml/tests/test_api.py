from pathlib import Path

from fastapi.testclient import TestClient

from app.config import settings

CITA = {"id": "c1", "antelacion_dias": 30, "dia_semana": 1, "edad": 35, "beca": False, "sms_recibido": True,
        "inasistencias_previas": 3, "citas_previas": 4}


def test_health(cliente):
    assert cliente.get("/health").json() == {"status": "ok", "modelo_no_show": True}


def test_predice_y_devuelve_id_riesgo_y_aviso(cliente):
    r = cliente.post("/predict/no-show", json={"citas": [CITA, {**CITA, "id": "c2", "antelacion_dias": 0, "inasistencias_previas": 0}]})
    assert r.status_code == 200
    cuerpo = r.json()
    assert [p["id"] for p in cuerpo["predicciones"]] == ["c1", "c2"]
    assert all(0 <= p["probabilidad_inasistencia"] <= 1 and p["riesgo"] in ("BAJO", "MEDIO", "ALTO") for p in cuerpo["predicciones"])
    assert cuerpo["predicciones"][0]["probabilidad_inasistencia"] > cuerpo["predicciones"][1]["probabilidad_inasistencia"]
    assert cuerpo["version_modelo"] == "test-1" and cuerpo["sintetico"] is True and "no clinica" in cuerpo["aviso"]


def test_rechaza_atributos_invalidos_o_clinicos(cliente):
    assert cliente.post("/predict/no-show", json={"citas": [{**CITA, "dia_semana": 9}]}).status_code == 422
    assert cliente.post("/predict/no-show", json={"citas": [{**CITA, "diabetes": True}]}).status_code == 422  # extra="forbid": nada clinico
    assert cliente.post("/predict/no-show", json={"citas": []}).status_code == 422
    r = cliente.post("/predict/no-show", json={"citas": [{**CITA, "inasistencias_previas": 9, "citas_previas": 2}]})
    assert r.status_code == 422 and "no puede superar" in r.json()["detail"]


def test_lote_maximo(cliente, monkeypatch):
    monkeypatch.setattr(settings, "max_lote", 1)
    assert cliente.post("/predict/no-show", json={"citas": [CITA, CITA]}).status_code == 413


def test_clave_api_si_esta_configurada(cliente, monkeypatch):
    monkeypatch.setattr(settings, "ml_api_key", "secreta")
    assert cliente.get("/model/info").status_code == 401
    assert cliente.get("/model/info", headers={"X-Api-Key": "secreta"}).status_code == 200
    assert cliente.get("/health").status_code == 200  # el health no exige clave


def test_info_y_segmentos(cliente):
    assert cliente.get("/model/info").json()["no_show"]["version"] == "test-1"
    assert cliente.get("/segments/demanda").json()["k"] == 2


def test_sin_modelo_responde_503_con_instrucciones(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "no_show_model_path", tmp_path / "no-existe.joblib")
    monkeypatch.setattr(settings, "segmentos_path", tmp_path / "no-existe.json")
    from app.main import app

    with TestClient(app) as c:
        assert c.get("/health").json()["modelo_no_show"] is False
        r = c.post("/predict/no-show", json={"citas": [CITA]})
        assert r.status_code == 503 and "train.py" in r.json()["detail"]
        assert c.get("/segments/demanda").status_code == 503
