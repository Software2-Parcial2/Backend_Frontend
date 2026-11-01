// GENERADO por scripts/gen-contracts.mjs desde contracts/events/*.schema.json. No editar a mano.
export const SCHEMAS: readonly Record<string, unknown>[] = [
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/cita.confirmada.schema.json",
    "title": "cita.confirmada",
    "description": "Evento de dominio MS3 -> varios (exchange sigec.eventos). Lo consume MS8 para los recordatorios.",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "cita.confirmada"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "pacienteId",
              "medicoId",
              "fechaHora"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "medicoId": {
                "type": "string",
                "format": "uuid"
              },
              "fechaHora": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/envelope.schema.json",
    "title": "Sobre de mensaje SIGEC",
    "type": "object",
    "required": [
      "id",
      "type",
      "occurredAt",
      "correlationId",
      "causationId",
      "version",
      "payload"
    ],
    "additionalProperties": false,
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "description": "Identificador unico del mensaje. Los consumidores deduplican por este campo."
      },
      "type": {
        "type": "string",
        "pattern": "^[a-z0-9]+(\\.[a-z0-9-]+)+$",
        "description": "Tipo del mensaje; coincide con la routing key."
      },
      "occurredAt": {
        "type": "string",
        "format": "date-time",
        "description": "ISO 8601 en UTC (termina en Z)."
      },
      "correlationId": {
        "type": "string",
        "format": "uuid",
        "description": "Id de la SAGA (sagaId) o del flujo que origina el mensaje."
      },
      "causationId": {
        "anyOf": [
          {
            "type": "string",
            "format": "uuid"
          },
          {
            "type": "null"
          }
        ],
        "description": "Id del mensaje que causo este (null si es el primero)."
      },
      "version": {
        "type": "integer",
        "minimum": 1,
        "description": "Version del esquema del payload."
      },
      "payload": {
        "type": "object"
      }
    }
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/factura.creada.schema.json",
    "title": "factura.creada",
    "description": "Evento de dominio MS6 -> varios (exchange sigec.eventos, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "factura.creada"
          },
          "payload": {
            "type": "object",
            "required": [
              "facturaId",
              "citaId",
              "pacienteId",
              "monto",
              "estado"
            ],
            "additionalProperties": false,
            "properties": {
              "facturaId": {
                "type": "string",
                "format": "uuid"
              },
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "monto": {
                "type": "number",
                "minimum": 0
              },
              "estado": {
                "enum": [
                  "PENDIENTE",
                  "PROVISIONAL",
                  "CONFIRMADA",
                  "ANULADA"
                ]
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro-provisional.rechazado.schema.json",
    "title": "facturacion.cobro-provisional.rechazado",
    "description": "Respuesta MS6 -> MS3 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro-provisional.rechazado"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "motivo"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "motivo": {
                "type": "string"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro-provisional.registrado.schema.json",
    "title": "facturacion.cobro-provisional.registrado",
    "description": "Respuesta MS6 -> MS3 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro-provisional.registrado"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "facturaId",
              "monto"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "facturaId": {
                "type": "string",
                "format": "uuid"
              },
              "monto": {
                "type": "number",
                "minimum": 0
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro-provisional.solicitar.schema.json",
    "title": "facturacion.cobro-provisional.solicitar",
    "description": "Comando MS3 -> MS6 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro-provisional.solicitar"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "pacienteId",
              "medicoId",
              "especialidad",
              "fechaHora"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "medicoId": {
                "type": "string",
                "format": "uuid"
              },
              "especialidad": {
                "type": "string"
              },
              "fechaHora": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro.anulado.schema.json",
    "title": "facturacion.cobro.anulado",
    "description": "Respuesta MS6 -> MS3 (exchange sigec.saga, routing key = type). facturaId es opcional: puede no existir cobro que anular.",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro.anulado"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "facturaId": {
                "type": "string",
                "format": "uuid"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro.anular.schema.json",
    "title": "facturacion.cobro.anular",
    "description": "Comando MS3 -> MS6 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro.anular"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "motivo"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "facturaId": {
                "type": "string",
                "format": "uuid"
              },
              "motivo": {
                "type": "string"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/facturacion.cobro.confirmar.schema.json",
    "title": "facturacion.cobro.confirmar",
    "description": "Comando MS3 -> MS6 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "facturacion.cobro.confirmar"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "facturaId"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "facturaId": {
                "type": "string",
                "format": "uuid"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/notificaciones.cita-cancelada.enviar.schema.json",
    "title": "notificaciones.cita-cancelada.enviar",
    "description": "Comando MS3 -> MS8 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "notificaciones.cita-cancelada.enviar"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "pacienteId",
              "motivo"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "motivo": {
                "type": "string"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/notificaciones.cita-confirmada.enviada.schema.json",
    "title": "notificaciones.cita-confirmada.enviada",
    "description": "Respuesta MS8 -> MS3 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "notificaciones.cita-confirmada.enviada"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "notificacionId",
              "canal"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "notificacionId": {
                "type": "string",
                "format": "uuid"
              },
              "canal": {
                "type": "string"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/notificaciones.cita-confirmada.enviar.schema.json",
    "title": "notificaciones.cita-confirmada.enviar",
    "description": "Comando MS3 -> MS8 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "notificaciones.cita-confirmada.enviar"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "pacienteId",
              "medicoId",
              "fechaHora"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "medicoId": {
                "type": "string",
                "format": "uuid"
              },
              "fechaHora": {
                "type": "string",
                "format": "date-time"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/notificaciones.cita-confirmada.fallida.schema.json",
    "title": "notificaciones.cita-confirmada.fallida",
    "description": "Respuesta MS8 -> MS3 (exchange sigec.saga, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "notificaciones.cita-confirmada.fallida"
          },
          "payload": {
            "type": "object",
            "required": [
              "citaId",
              "motivo"
            ],
            "additionalProperties": false,
            "properties": {
              "citaId": {
                "type": "string",
                "format": "uuid"
              },
              "motivo": {
                "type": "string"
              }
            }
          }
        }
      }
    ]
  },
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://sigec.local/contracts/events/paciente.creado.schema.json",
    "title": "paciente.creado",
    "description": "Evento MS2 -> varios (exchange sigec.eventos, routing key = type).",
    "allOf": [
      {
        "$ref": "envelope.schema.json"
      },
      {
        "properties": {
          "type": {
            "const": "paciente.creado"
          },
          "payload": {
            "type": "object",
            "required": [
              "pacienteId",
              "nombre",
              "documento"
            ],
            "additionalProperties": false,
            "properties": {
              "pacienteId": {
                "type": "string",
                "format": "uuid"
              },
              "nombre": {
                "type": "string"
              },
              "documento": {
                "type": "string"
              },
              "email": {
                "type": [
                  "string",
                  "null"
                ]
              }
            }
          }
        }
      }
    ]
  }
];
