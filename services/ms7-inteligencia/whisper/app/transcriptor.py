from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Protocol


class AudioInvalido(Exception):
    """El archivo no se pudo decodificar como audio."""


class AudioDemasiadoLargo(Exception):
    def __init__(self, duracion: float, maximo: float):
        super().__init__(f"El audio dura {duracion:.1f} s y el maximo es {maximo:.0f} s")
        self.duracion, self.maximo = duracion, maximo


@dataclass
class Resultado:
    texto: str
    idioma: str
    duracion_s: float
    modelo: str


class Transcriptor(Protocol):
    nombre: str

    def transcribir(self, audio: bytes, idioma: str | None, max_duracion_s: float) -> Resultado: ...


class FasterWhisperTranscriptor:
    def __init__(self, modelo: str, device: str, compute_type: str):
        from faster_whisper import WhisperModel

        self.nombre = f"faster-whisper/{modelo}"
        self._m = WhisperModel(modelo, device=device, compute_type=compute_type)

    def transcribir(self, audio: bytes, idioma: str | None, max_duracion_s: float) -> Resultado:
        try:
            segmentos, info = self._m.transcribe(io.BytesIO(audio), language=idioma, vad_filter=True, beam_size=1, condition_on_previous_text=False)
        except Exception as e:  # PyAV lanza varios tipos al no poder decodificar
            raise AudioInvalido(f"No se pudo leer el audio: {e}") from e
        if info.duration > max_duracion_s:  # la duracion se conoce antes de transcribir (no se gasta CPU en audios largos)
            raise AudioDemasiadoLargo(info.duration, max_duracion_s)
        texto = " ".join(s.text.strip() for s in segmentos).strip()
        return Resultado(texto=texto, idioma=info.language, duracion_s=round(float(info.duration), 2), modelo=self.nombre)
