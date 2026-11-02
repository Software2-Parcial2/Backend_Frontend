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
    assert r["criterio"].startswith("silueta maxima")
    mejor = max((e for e in r["evaluacion_k"] if e["valido"]), key=lambda e: e["silueta"])
    assert r["k"] == mejor["k"]


def test_errores_claros(datos_citas):
    with pytest.raises(ValueError, match="Faltan columnas"):
        agregar(datos_citas.drop(columns=["estado"]))
    with pytest.raises(ValueError, match="al menos 6"):
        segmentar(datos_citas.head(3))


def test_un_valor_atipico_se_excluye_y_se_informa(datos_citas):
    """Una especialidad con 200 citas en UNA semana (p. ej. datos de prueba olvidados) no debe acaparar un segmento propio."""
    import pandas as pd

    atipico = pd.DataFrame({"especialidad": "outlier", "fecha_hora": pd.Timestamp("2026-02-02T10:00:00Z"), "medico_id": "x",
                            "estado": "CONFIRMADA", "fecha_creacion": pd.Timestamp("2026-01-30T10:00:00Z")}, index=range(200))
    r = segmentar(pd.concat([datos_citas, atipico], ignore_index=True))
    assert r["atipicos_excluidos"] == [{"especialidad": "outlier", "semana": "2026-02-02/2026-02-08", "citas": 200}]
    assert "outlier" not in r["segmento_por_especialidad"]
    assert min(s["observaciones"] for s in r["segmentos"]) >= r["tamano_minimo_segmento"]


def test_sin_atipicos_no_se_excluye_nada(datos_citas):
    assert segmentar(datos_citas)["atipicos_excluidos"] == []
