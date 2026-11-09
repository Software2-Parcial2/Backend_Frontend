import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import 'errores.dart';

const _uuid = Uuid();
String nuevoUuid() => _uuid.v4();

/// Pagina de una lista con cursor (docs/api.md): `siguiente` es null cuando no hay mas.
class Pagina<T> {
  const Pagina(this.items, this.siguiente);
  final List<T> items;
  final String? siguiente;
}

typedef Json = Map<String, dynamic>;

/// Cliente HTTP comun (port de packages/api-client): problem+json, Idempotency-Key, cursor, X-Correlation-Id.
/// El token se pide en CADA peticion, nunca se copia.
class ClienteApi {
  ClienteApi({required this.baseUrl, required this.token, http.Client? cliente, this.idioma = 'es', this.alNoAutenticado})
      : _http = cliente ?? http.Client();

  final String baseUrl;
  final Future<String?> Function() token;
  final Future<bool> Function()? alNoAutenticado;
  final String idioma;
  final http.Client _http;

  Uri _uri(String ruta, Map<String, Object?>? query) {
    final q = <String, String>{
      if (query != null)
        for (final e in query.entries)
          if (e.value != null && '${e.value}' != '') e.key: '${e.value}',
    };
    final base = baseUrl.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base$ruta').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<http.Response> _ejecutar(String metodo, String ruta, {Object? cuerpo, Map<String, Object?>? query, String? clave, bool conClave = true, bool reintentando = false}) async {
    final cid = nuevoUuid();
    final cab = <String, String>{
      'Accept': 'application/json, application/problem+json;q=0.9, */*;q=0.5',
      'Accept-Language': idioma,
      'X-Correlation-Id': cid,
    };
    final t = await token();
    if (t != null && t.isNotEmpty) cab['Authorization'] = 'Bearer $t';
    if (const {'POST', 'PUT', 'PATCH'}.contains(metodo) && conClave) cab['Idempotency-Key'] = clave ?? nuevoUuid();
    String? body;
    if (cuerpo != null) {
      cab['Content-Type'] = 'application/json';
      body = jsonEncode(cuerpo);
    }
    final req = http.Request(metodo, _uri(ruta, query))..headers.addAll(cab);
    if (body != null) req.body = body;
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 30)));
    } catch (_) {
      throw ApiError(0, mensajeAlterno: 'No hay conexion con el servidor. Revisa tu red e intenta de nuevo.', correlationIdLocal: cid);
    }
    if (res.statusCode == 401 && !reintentando && alNoAutenticado != null) {
      if (await alNoAutenticado!()) return _ejecutar(metodo, ruta, cuerpo: cuerpo, query: query, clave: clave, conClave: conClave, reintentando: true);
    }
    if ((res.statusCode == 429 || res.statusCode == 503) && metodo == 'GET' && !reintentando) {
      final ra = int.tryParse(res.headers['retry-after'] ?? '');
      if (ra != null && ra > 0 && ra <= 3) {
        await Future<void>.delayed(Duration(seconds: ra));
        return _ejecutar(metodo, ruta, query: query, reintentando: true);
      }
    }
    if (res.statusCode < 200 || res.statusCode >= 300) throw _error(res, cid);
    return res;
  }

  ApiError _error(http.Response res, String cid) {
    final texto = utf8.decode(res.bodyBytes, allowMalformed: true);
    final tipo = res.headers['content-type'] ?? '';
    if (texto.isNotEmpty && tipo.contains('json')) {
      try {
        final j = jsonDecode(texto);
        if (j is Map<String, dynamic>) {
          // Servicios antiguos: {message} en vez de problem+json.
          if (j['detail'] == null && j['message'] != null) {
            final m = j['message'];
            j['detail'] = m is List ? m.join('; ') : '$m';
          }
          return ApiError(res.statusCode, problema: j, correlationIdLocal: cid);
        }
      } catch (_) {}
    }
    return ApiError(res.statusCode, mensajeAlterno: texto.length > 300 ? texto.substring(0, 300) : texto, correlationIdLocal: cid);
  }

  dynamic _datos(http.Response res) {
    if (res.statusCode == 204 || res.statusCode == 205 || res.bodyBytes.isEmpty) return null;
    final texto = utf8.decode(res.bodyBytes);
    return (res.headers['content-type'] ?? '').contains('json') ? jsonDecode(texto) : texto;
  }

  Future<dynamic> get(String ruta, {Map<String, Object?>? query}) async => _datos(await _ejecutar('GET', ruta, query: query));
  Future<dynamic> post(String ruta, [Object? cuerpo, String? clave]) async => _datos(await _ejecutar('POST', ruta, cuerpo: cuerpo, clave: clave));
  Future<dynamic> put(String ruta, [Object? cuerpo, String? clave]) async => _datos(await _ejecutar('PUT', ruta, cuerpo: cuerpo, clave: clave));

  Future<Json> getJson(String ruta, {Map<String, Object?>? query}) async => (await get(ruta, query: query) as Map).cast<String, dynamic>();

  /// Una pagina de una lista con cursor.
  Future<Pagina<Json>> pagina(String ruta, {Map<String, Object?>? query, int? limite, String? cursor}) async {
    final r = await get(ruta, query: {...?query, 'limite': limite, 'cursor': cursor});
    final items = r is Map && r['items'] is List ? [for (final e in r['items'] as List) (e as Map).cast<String, dynamic>()] : <Json>[];
    return Pagina(items, r is Map ? r['siguiente'] as String? : null);
  }

  /// Todas las paginas (con tope).
  Future<List<Json>> todas(String ruta, {Map<String, Object?>? query, int limite = 100, int maximo = 1000}) async {
    final items = <Json>[];
    String? cursor;
    for (;;) {
      final p = await pagina(ruta, query: query, limite: limite, cursor: cursor);
      items.addAll(p.items);
      if (p.siguiente == null) return items;
      if (items.length >= maximo) return items.sublist(0, maximo);
      cursor = p.siguiente;
    }
  }
}

/// Estados finales de la SAGA de una cita (docs/saga-citas.md).
const estadosFinalesCita = ['CONFIRMADA', 'CANCELADA', 'CANCELADA_USUARIO', 'ANULADA', 'EN_SALA', 'ATENDIDA', 'NO_ASISTIO'];

/// `POST /api/citas` responde 202 y la SAGA sigue en segundo plano: consulta la cita hasta un estado final.
/// Si se agota el tiempo lanza ApiError `TIEMPO_AGOTADO`.
Future<Json> esperarCita(ClienteApi api, String citaId, {Duration intervalo = const Duration(seconds: 1), Duration max = const Duration(seconds: 60)}) async {
  final fin = DateTime.now().add(max);
  for (;;) {
    final c = await api.getJson('/api/citas/${Uri.encodeComponent(citaId)}');
    if (estadosFinalesCita.contains(c['estado'])) return c;
    if (!DateTime.now().isBefore(fin)) {
      throw ApiError(0, problema: {'code': 'TIEMPO_AGOTADO', 'detail': 'La cita sigue en proceso; consulta su estado en unos minutos.'});
    }
    await Future<void>.delayed(intervalo);
  }
}
