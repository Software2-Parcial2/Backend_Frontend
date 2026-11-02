# Documentos administrativos de ejemplo (RAG)

> **EJEMPLO FICTICIO.** Estos documentos los redactó el equipo de desarrollo para probar el RAG de MS7. Los nombres, importes, horarios y plazos
> son inventados y **deben sustituirse por los documentos reales de la clínica** antes de cualquier uso.

Formato: Markdown con una cabecera `---` que incluye `titulo` y `version`; cada sección `##` es la unidad de cita
("*Documento, sección*"). Para actualizar el conocimiento del agente: editar los archivos y llamar a
`POST /api/inteligencia/rag/reindexar` (rol administrador). Solo se reindexan los documentos cuyo contenido cambió.

| Archivo | Contenido |
|---|---|
| `politica-cancelacion-reprogramacion.md` | Plazos y penalizaciones de cancelación y reprogramación de citas |
| `aranceles.md` | Aranceles de consultas, estudios y descuentos |
| `horarios-atencion.md` | Horarios de atención por área y feriados |
| `protocolo-atencion.md` | Protocolo de recepción y atención al paciente |
| `proteccion-datos.md` | Tratamiento de datos personales y de salud |
