class ErrorCampo {
  const ErrorCampo(this.campo, this.mensaje);
  final String campo, mensaje;
}

const _codigoPorEstado = {
  0: 'SIN_CONEXION', 400: 'SOLICITUD_INVALIDA', 401: 'NO_AUTENTICADO', 403: 'PROHIBIDO', 404: 'NO_ENCONTRADO',
  409: 'CONFLICTO', 422: 'REGLA_DE_NEGOCIO', 429: 'DEMASIADAS_PETICIONES', 500: 'ERROR_INTERNO', 503: 'SERVICIO_NO_DISPONIBLE',
};

/// Error de una llamada a la API. `estado` 0 = no hubo respuesta (red caida). `code` estable, `correlationId` para soporte.
class ApiError implements Exception {
  ApiError(this.estado, {Map<String, dynamic>? problema, String? mensajeAlterno, String? correlationIdLocal})
      : problema = problema,
        detalle = (problema?['detail'] as String?) ?? mensajeAlterno,
        titulo = problema?['title'] as String?,
        code = (problema?['code'] as String?) ?? _codigoPorEstado[estado] ?? (estado >= 500 ? 'ERROR_INTERNO' : 'ERROR'),
        correlationId = (problema?['correlationId'] as String?) ?? correlationIdLocal,
        errores = [
          if (problema?['errors'] is List)
            for (final e in problema!['errors'] as List)
              if (e is Map) ErrorCampo('${e['campo']}', '${e['mensaje']}'),
        ];

  final int estado;
  final String code;
  final String? titulo, detalle, correlationId;
  final List<ErrorCampo> errores;
  final Map<String, dynamic>? problema;

  String get message {
    final d = detalle;
    if (d != null && d.isNotEmpty) return d;
    if (titulo != null && titulo!.isNotEmpty) return titulo!;
    return 'Error $estado';
  }

  String? mensajeDe(String campo) {
    for (final e in errores) {
      if (e.campo == campo) return e.mensaje;
    }
    return null;
  }

  @override
  String toString() => 'ApiError($estado, $code): $message';
}
