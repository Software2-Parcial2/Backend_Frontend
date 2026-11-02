import pandas as pd
import pytest

from app.demanda import agregar, segmentar
from app.features import a_matriz, historial_previo


def test_historial_previo_no_filtra_el_futuro_ni_el_mismo_dia():
    df = pd.DataFrame({
        "p": ["a", "a", "a", "a", "b"],
        "dia": pd.to_datetime(["2016-05-01", "2016-05-01", "2016-05-03", "2016-05-05", "2016-05-01"]),
        "falta": [1, 0, 1, 0, 0],
    })
    r = historial_previo(df, "p", "dia", "falta").sort_values(["p", "dia"]).reset_index(drop=True)
    # El 1/5 (dos citas el mismo dia) no tiene pasado; el 3/5 ve 2 citas y 1 falta; el 5/5 ve 3 citas y 2 faltas.
    assert r.loc[r["dia"] == "2016-05-01", "citas_previas"].tolist() == [0, 0, 0]
    assert r.loc[(r["p"] == "a") & (r["dia"] == "2016-05-03"), ["citas_previas", "inasistencias_previas"]].iloc[0].tolist() == [2, 1]
    assert r.loc[(r["p"] == "a") & (r["dia"] == "2016-05-05"), ["citas_previas", "inasistencias_previas"]].iloc[0].tolist() == [3, 2]


def test_tasa_previa_sin_division_por_cero():
    x = a_matriz(pd.DataFrame([{"antelacion_dias": 1, "dia_semana": 0, "edad": 30, "beca": 0, "sms_recibido": 0,
                                "inasistencias_previas": 0, "citas_previas": 0}]))
    assert x["tasa_inasistencia_previa"].iloc[0] == 0


def test_segmentacion_separa_volumenes_y_etiqueta(datos_citas):
    r = segmentar(datos_citas, k=3)
    assert r["k"] == 3 and len(r["segmentos"]) == 3
    assert [s["etiqueta"] for s in r["segmentos"]] == ["Demanda alta", "Demanda media", "Demanda baja"]
    seg = r["segmento_por_especialidad"]
    assert seg["Medicina General"]["segmento"] < seg["Neurologia"]["segmento"]  # mas demanda -> id menor
    assert r["demanda_por_especialidad"]["Medicina General"]["citas_por_semana"] > r["demanda_por_especialidad"]["Neurologia"]["citas_por_semana"]


def test_k_por_silueta_y_evaluacion(datos_citas):
    r = segmentar(datos_citas)
    assert r["criterio"] == "silueta maxima"
    mejor = max(r["evaluacion_k"], key=lambda e: e["silueta"])
    assert r["k"] == mejor["k"]


def test_errores_claros(datos_citas):
    with pytest.raises(ValueError, match="Faltan columnas"):
        agregar(datos_citas.drop(columns=["estado"]))
    with pytest.raises(ValueError, match="al menos 6"):
        segmentar(datos_citas.head(3))
