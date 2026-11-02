from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CitaAtributos(BaseModel):
    """Atributos administrativos de una cita (ningun dato clinico)."""

    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, max_length=64, description="Identificador opcional que se devuelve tal cual")
    antelacion_dias: int = Field(ge=0, le=730, description="Dias entre la solicitud y la fecha de la cita")
    dia_semana: int = Field(ge=0, le=6, description="0 = lunes ... 6 = domingo")
    edad: int = Field(ge=0, le=120)
    beca: bool = Field(description="Tiene beca o seguro/subsidio")
    sms_recibido: bool = Field(description="Recibio recordatorio por SMS/mensaje")
    inasistencias_previas: int = Field(ge=0, le=1000)
    citas_previas: int = Field(ge=0, le=1000)


class SolicitudNoShow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    citas: list[CitaAtributos] = Field(min_length=1)


class Prediccion(BaseModel):
    id: str | None
    probabilidad_inasistencia: float
    prediccion_inasistira: bool
    riesgo: Literal["BAJO", "MEDIO", "ALTO"]


class RespuestaNoShow(BaseModel):
    predicciones: list[Prediccion]
    version_modelo: str
    umbral: float
    sintetico: bool
    aviso: str
