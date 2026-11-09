import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_flutter/api/cliente.dart';
import 'package:mobile_flutter/offline/cola.dart';

const _cab = {'content-type': 'application/json'};
final _cuerpo = {'pacienteId': 'p', 'medicoId': 'm', 'especialidad': 'cardiologia', 'fechaHora': '2026-11-10T14:00:00Z'};

ClienteApi _api(MockClientHandler h) => ClienteApi(baseUrl: 'http://x', token: () async => 't', cliente: MockClient(h));
Future<Json> _final(ClienteApi a, String id) => a.getJson('/api/citas/$id');

void main() {
  late ColaServicio cola;
  var ahora = DateTime(2026, 11, 9, 10);
  setUp(() {
    ahora = DateTime(2026, 11, 9, 10);
    cola = ColaServicio(AlmacenColaMemoria(), ahora: () => ahora, esperaCita: _final);
  });

  test('envia con su Idempotency-Key y queda confirmada', () async {
    final claves = <String?>[];
    final api = _api((r) async {
      if (r.method == 'POST') { claves.add(r.headers['Idempotency-Key']); return http.Response(jsonEncode({'citaId': 'c1'}), 202, headers: _cab); }
      return http.Response(jsonEncode({'citaId': 'c1', 'estado': 'CONFIRMADA'}), 200, headers: _cab);
    });
    final s = await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    await cola.procesar(api);
    expect(claves, [s.clave]);
    expect(cola.instantanea.single.estado, EstadoSolicitud.confirmada);
    expect(cola.instantanea.single.citaId, 'c1');
  });

  test('sin red queda pendiente y reenvia con la MISMA clave', () async {
    var caido = true;
    final claves = <String?>[];
    final api = _api((r) async {
      if (caido) throw http.ClientException('sin red');
      if (r.method == 'POST') { claves.add(r.headers['Idempotency-Key']); return http.Response(jsonEncode({'citaId': 'c1'}), 202, headers: _cab); }
      return http.Response(jsonEncode({'citaId': 'c1', 'estado': 'CONFIRMADA'}), 200, headers: _cab);
    });
    final s = await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    await cola.procesar(api);
    expect(cola.instantanea.single.estado, EstadoSolicitud.pendiente);
    expect(cola.instantanea.single.error, contains('Sin conexión'));
    caido = false;
    await cola.procesar(api);
    expect(claves, [s.clave]);
    expect(cola.instantanea.single.estado, EstadoSolicitud.confirmada);
  });

  test('409 pasa a conflicto', () async {
    final api = _api((r) async => http.Response(jsonEncode({'code': 'HORARIO_OCUPADO'}), 409, headers: {'content-type': 'application/problem+json'}));
    await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    await cola.procesar(api);
    expect(cola.instantanea.single.estado, EstadoSolicitud.conflicto);
    expect(cola.instantanea.single.error, contains('ya no está disponible'));
  });

  test('cita cancelada por la SAGA es conflicto con su motivo', () async {
    final api = _api((r) async => r.method == 'POST'
        ? http.Response(jsonEncode({'citaId': 'c1'}), 202, headers: _cab)
        : http.Response(jsonEncode({'citaId': 'c1', 'estado': 'CANCELADA', 'motivoFallo': 'Pago rechazado'}), 200, headers: _cab));
    await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    await cola.procesar(api);
    expect(cola.instantanea.single.estado, EstadoSolicitud.conflicto);
    expect(cola.instantanea.single.error, 'Pago rechazado');
  });

  test('pendiente de mas de 24 h caduca sin enviarse', () async {
    var posts = 0;
    final api = _api((r) async { posts++; return http.Response('{}', 202, headers: _cab); });
    await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    ahora = ahora.add(const Duration(hours: 25));
    await cola.procesar(api);
    expect(posts, 0);
    expect(cola.instantanea.single.estado, EstadoSolicitud.caducada);
  });

  test('reintentar genera clave nueva; descartar la quita', () async {
    final s = await cola.agregar(_cuerpo, especialidad: 'cardiologia', medico: 'Dr. A');
    final antes = s.clave;
    await cola.reintentar(s.id);
    expect(cola.instantanea.single.clave, isNot(antes));
    await cola.descartar(s.id);
    expect(cola.instantanea, isEmpty);
  });

  test('serializa y recupera una solicitud', () {
    final s = Solicitud(id: 'i', clave: 'k', creada: 1, estado: EstadoSolicitud.confirmando, cuerpo: _cuerpo, especialidad: 'e', medico: 'm', citaId: 'c');
    final r = Solicitud.fromJson(jsonDecode(jsonEncode(s.toJson())) as Map<String, dynamic>);
    expect(r.estado, EstadoSolicitud.confirmando);
    expect(r.citaId, 'c');
    expect(r.cuerpo['fechaHora'], _cuerpo['fechaHora']);
  });
}
