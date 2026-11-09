import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_flutter/api/cliente.dart';
import 'package:mobile_flutter/main.dart';
import 'package:mobile_flutter/offline/cola.dart';
import 'package:mobile_flutter/providers.dart';
import 'package:mobile_flutter/sesion/sesion.dart';

class _AuthFalso implements ProveedorAuth {
  _AuthFalso({this.conSesion = false});
  final bool conSesion;
  String? refresh;
  String _jwt() {
    String b(Map m) => base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
    return '${b({'alg': 'none'})}.${b({'sub': 'u1', 'preferred_username': 'paciente'})}.x';
  }

  TokensAuth _t() => TokensAuth(accessToken: _jwt(), vence: DateTime.now().add(const Duration(hours: 1)), refreshToken: 'rt', idToken: _jwt());
  @override
  Future<TokensAuth> entrar() async => _t();
  @override
  Future<TokensAuth> renovar(String r) async => _t();
  @override
  Future<void> salir(String idToken) async {}
  @override
  Future<String?> leerRefresh() async => conSesion ? 'rt' : refresh;
  @override
  Future<void> guardarRefresh(String t) async => refresh = t;
  @override
  Future<void> borrarRefresh() async => refresh = null;
}

http.Response _json(Object o) => http.Response(jsonEncode(o), 200, headers: {'content-type': 'application/json'});

ClienteApi _api() {
  final manana = DateTime.now().toUtc().add(const Duration(days: 1)).toIso8601String();
  return ClienteApi(
    baseUrl: 'http://x',
    token: () async => 't',
    cliente: MockClient((r) async {
      final p = r.url.path;
      if (p == '/api/pacientes/me') return _json({'id': 'p1', 'nombre': 'Carla Rojas', 'numeroHistoria': 'HC-1', 'documento': '123'});
      if (p == '/api/citas') {
        return _json({'items': [{'citaId': 'c1abcdef', 'estado': 'CONFIRMADA', 'medicoId': 'm1', 'especialidad': 'cardiologia', 'fechaHora': manana}], 'siguiente': null});
      }
      if (p == '/api/medicos') {
        return _json({'items': [{'id': 'm1', 'nombre': 'Dra. Pérez', 'especialidad': {'codigo': 'cardiologia', 'nombre': 'Cardiología'}, 'consultorio': '12'}], 'siguiente': null});
      }
      if (p == '/api/notificaciones') return _json({'items': [{'id': 'a1', 'tipo': 'CITA_CONFIRMADA', 'creadaEn': manana, 'leida': false}], 'siguiente': null});
      if (p.startsWith('/api/notificaciones/preferencias')) return _json({'canales': ['EMAIL'], 'tiposAviso': [], 'telegramVinculado': false, 'antelacionHoras': 24});
      return _json({'items': [], 'siguiente': null});
    }),
  );
}

Widget _app(_AuthFalso auth) => ProviderScope(
      overrides: [
        proveedorAuthProvider.overrideWithValue(auth),
        apiProvider.overrideWithValue(_api()),
        colaServicioProvider.overrideWithValue(ColaServicio(AlmacenColaMemoria())),
      ],
      child: const SigecApp(),
    );

void main() {
  testWidgets('sin sesion muestra el login y al entrar abre Mis citas', (t) async {
    await t.pumpWidget(_app(_AuthFalso()));
    await t.pumpAndSettle();
    expect(find.text('Sus citas y avisos, en su teléfono'), findsOneWidget);
    expect(find.text('Iniciar sesión'), findsOneWidget);

    await t.tap(find.text('Iniciar sesión'));
    await t.pumpAndSettle();
    expect(find.text('Mis citas'), findsOneWidget);
    expect(find.text('Cardiologia · Dra. Pérez'), findsNothing); // la tarjeta usa «hora · Especialidad»
    expect(find.textContaining('Cardiologia'), findsWidgets);
    expect(find.textContaining('Consultorio 12'), findsOneWidget);
    for (final p in ['Citas', 'Solicitar', 'Avisos', 'Perfil']) {
      expect(find.text(p), findsOneWidget);
    }
  });

  testWidgets('con sesion guardada navega a Avisos y Perfil', (t) async {
    await t.pumpWidget(_app(_AuthFalso(conSesion: true)));
    await t.pumpAndSettle();
    expect(find.text('Mis citas'), findsOneWidget);

    await t.tap(find.text('Avisos'));
    await t.pumpAndSettle();
    expect(find.text('Marcar leídos'), findsOneWidget);
    expect(find.text('Cita confirmada'), findsOneWidget);

    await t.tap(find.text('Perfil'));
    await t.pumpAndSettle();
    expect(find.text('Carla Rojas'), findsOneWidget);
    expect(find.text('Correo electrónico'), findsOneWidget);
    expect(find.text('Mis estudios'), findsOneWidget);
    expect(find.text('Cerrar sesión'), findsOneWidget);

    await t.drag(find.byType(ListView), const Offset(0, -300));
    await t.tap(find.text('Cerrar sesión'));
    await t.pumpAndSettle();
    expect(find.text('Iniciar sesión'), findsOneWidget);
  });
}
