import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_flutter/api/cliente.dart';
import 'package:mobile_flutter/api/errores.dart';

ClienteApi crear(MockClientHandler h, {Future<String?> Function()? token}) =>
    ClienteApi(baseUrl: 'http://x/', token: token ?? () async => 'tok', cliente: MockClient(h));

void main() {
  test('envia cabeceras, token e Idempotency-Key en POST', () async {
    late http.Request visto;
    final api = crear((r) async {
      visto = r;
      return http.Response('{"citaId":"1"}', 202, headers: {'content-type': 'application/json'});
    });
    final r = await api.post('/api/citas', {'a': 1}, 'clave-fija') as Map;
    expect(r['citaId'], '1');
    expect(visto.headers['Authorization'], 'Bearer tok');
    expect(visto.headers['Idempotency-Key'], 'clave-fija');
    expect(visto.headers['X-Correlation-Id'], isNotEmpty);
    expect(visto.url.toString(), 'http://x/api/citas');
  });

  test('GET no lleva Idempotency-Key', () async {
    late http.Request visto;
    final api = crear((r) async { visto = r; return http.Response('{}', 200, headers: {'content-type': 'application/json'}); });
    await api.get('/api/medicos');
    expect(visto.headers.containsKey('Idempotency-Key'), isFalse);
  });

  test('problem+json se vuelve ApiError', () async {
    final api = crear((r) async => http.Response(jsonEncode({'code': 'HORARIO_OCUPADO', 'detail': 'Ocupado', 'correlationId': 'c1'}), 409, headers: {'content-type': 'application/problem+json'}));
    expect(
      api.get('/x'),
      throwsA(isA<ApiError>().having((e) => e.estado, 'estado', 409).having((e) => e.code, 'code', 'HORARIO_OCUPADO').having((e) => e.correlationId, 'cid', 'c1')),
    );
  });

  test('sin red es estado 0', () async {
    final api = crear((r) async => throw http.ClientException('caido'));
    expect(api.get('/x'), throwsA(isA<ApiError>().having((e) => e.estado, 'estado', 0)));
  });

  test('pagina y todas siguen el cursor', () async {
    final api = crear((r) async {
      final cursor = r.url.queryParameters['cursor'];
      final cuerpo = cursor == null ? {'items': [{'id': 1}], 'siguiente': 'c2'} : {'items': [{'id': 2}], 'siguiente': null};
      return http.Response(jsonEncode(cuerpo), 200, headers: {'content-type': 'application/json'});
    });
    final todas = await api.todas('/api/medicos');
    expect(todas.map((e) => e['id']), [1, 2]);
  });

  test('esperarCita termina en estado final', () async {
    var n = 0;
    final api = crear((r) async => http.Response(jsonEncode({'citaId': 'c', 'estado': ++n < 3 ? 'PENDIENTE' : 'CONFIRMADA'}), 200, headers: {'content-type': 'application/json'}));
    final c = await esperarCita(api, 'c', intervalo: const Duration(milliseconds: 1));
    expect(c['estado'], 'CONFIRMADA');
  });

  test('esperarCita agota el tiempo', () async {
    final api = crear((r) async => http.Response('{"estado":"PENDIENTE"}', 200, headers: {'content-type': 'application/json'}));
    expect(esperarCita(api, 'c', intervalo: const Duration(milliseconds: 1), max: const Duration(milliseconds: 5)), throwsA(isA<ApiError>().having((e) => e.code, 'code', 'TIEMPO_AGOTADO')));
  });
}
