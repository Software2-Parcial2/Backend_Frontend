import 'dart:convert';

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';

const _claveRefresh = 'sigec.refresh';

enum EstadoSesion { cargando, sin, con }

class Sesion {
  const Sesion({this.estado = EstadoSesion.cargando, this.nombre = '', this.sub = '', this.error});
  final EstadoSesion estado;
  final String nombre, sub;
  final String? error;
}

/// Acceso a Keycloak y al almacen seguro; se puede sustituir en pruebas.
abstract class ProveedorAuth {
  Future<TokensAuth> entrar();
  Future<TokensAuth> renovar(String refreshToken);
  Future<void> salir(String idToken);
  Future<String?> leerRefresh();
  Future<void> guardarRefresh(String t);
  Future<void> borrarRefresh();
}

class TokensAuth {
  const TokensAuth({required this.accessToken, required this.vence, this.refreshToken, this.idToken});
  final String accessToken;
  final DateTime vence;
  final String? refreshToken, idToken;
}

/// Login OIDC + PKCE con flutter_appauth. Solo el refresh token se guarda (almacen seguro); el access token vive en memoria.
class ProveedorAppAuth implements ProveedorAuth {
  final _auth = const FlutterAppAuth();
  final _almacen = const FlutterSecureStorage();

  TokensAuth _a(dynamic r) => TokensAuth(
        accessToken: r.accessToken as String,
        vence: (r.accessTokenExpirationDateTime as DateTime?) ?? DateTime.now().add(const Duration(minutes: 5)),
        refreshToken: r.refreshToken as String?,
        idToken: r.idToken as String?,
      );

  @override
  Future<TokensAuth> entrar() async => _a(await _auth.authorizeAndExchangeCode(AuthorizationTokenRequest(
        oidcClientId, oidcRedirectUrl,
        issuer: oidcIssuer, scopes: oidcScopes, allowInsecureConnections: true)));

  @override
  Future<TokensAuth> renovar(String refreshToken) async => _a(await _auth.token(TokenRequest(
        oidcClientId, oidcRedirectUrl,
        issuer: oidcIssuer, scopes: oidcScopes, refreshToken: refreshToken, allowInsecureConnections: true)));

  @override
  Future<void> salir(String idToken) async {
    await _auth.endSession(EndSessionRequest(
        idTokenHint: idToken, postLogoutRedirectUrl: oidcRedirectUrl, issuer: oidcIssuer, allowInsecureConnections: true));
  }

  @override
  Future<String?> leerRefresh() => _almacen.read(key: _claveRefresh);
  @override
  Future<void> guardarRefresh(String t) => _almacen.write(key: _claveRefresh, value: t);
  @override
  Future<void> borrarRefresh() => _almacen.delete(key: _claveRefresh);
}

final proveedorAuthProvider = Provider<ProveedorAuth>((ref) => ProveedorAppAuth());

({String nombre, String sub}) _claims(String? jwt) {
  try {
    final partes = (jwt ?? '').split('.');
    final p = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(partes[1])))) as Map<String, dynamic>;
    return (nombre: (p['preferred_username'] as String?) ?? '', sub: (p['sub'] as String?) ?? '');
  } catch (_) {
    return (nombre: '', sub: '');
  }
}

class SesionNotifier extends Notifier<Sesion> {
  String? _acceso, _idToken;
  DateTime _vence = DateTime.fromMillisecondsSinceEpoch(0);

  ProveedorAuth get _p => ref.read(proveedorAuthProvider);

  @override
  Sesion build() {
    Future.microtask(() async {
      final ok = await _renovar();
      if (!ok && state.estado == EstadoSesion.cargando) state = const Sesion(estado: EstadoSesion.sin);
    });
    return const Sesion();
  }

  void _guardar(TokensAuth r) {
    _acceso = r.accessToken;
    _vence = r.vence;
    _idToken = r.idToken ?? _idToken;
    final c = _claims(r.idToken ?? r.accessToken);
    state = Sesion(estado: EstadoSesion.con, nombre: c.nombre, sub: c.sub);
  }

  Future<bool> _renovar() async {
    try {
      final rt = await _p.leerRefresh();
      if (rt == null) return false;
      try {
        final r = await _p.renovar(rt);
        if (r.refreshToken != null) await _p.guardarRefresh(r.refreshToken!);
        _guardar(r);
        return true;
      } catch (_) {
        await _p.borrarRefresh();
        return false;
      }
    } catch (_) {
      return false;
    }
  }

  Future<void> entrar() async {
    state = Sesion(estado: state.estado, nombre: state.nombre, sub: state.sub);
    try {
      final r = await _p.entrar();
      if (r.refreshToken != null) await _p.guardarRefresh(r.refreshToken!);
      _guardar(r);
    } catch (e) {
      state = const Sesion(estado: EstadoSesion.sin, error: 'No se pudo iniciar sesión');
    }
  }

  Future<void> salir() async {
    final id = _idToken;
    _acceso = null;
    _idToken = null;
    await _p.borrarRefresh();
    state = const Sesion(estado: EstadoSesion.sin);
    try {
      if (id != null) await _p.salir(id);
    } catch (_) {/* la sesion local ya se cerro */}
  }

  /// Token de acceso vigente (lo renueva con el refresh token si esta por vencer).
  Future<String?> token() async {
    if (_acceso != null && _vence.difference(DateTime.now()).inSeconds > 30) return _acceso;
    return (await _renovar()) ? _acceso : null;
  }
}

final sesionProvider = NotifierProvider<SesionNotifier, Sesion>(SesionNotifier.new);
