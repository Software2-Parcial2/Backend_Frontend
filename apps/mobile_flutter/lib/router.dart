import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/avisos.dart';
import 'screens/confirmada.dart';
import 'screens/detalle.dart';
import 'screens/estudio.dart';
import 'screens/inicio.dart';
import 'screens/login.dart';
import 'screens/pendiente.dart';
import 'screens/perfil.dart';
import 'screens/solicitar.dart';
import 'sesion/sesion.dart';
import 'theme.dart';

enum Pestana { inicio, solicitar, avisos, perfil }

const _pestanas = [
  (Pestana.inicio, 'Citas', '▦', '/'),
  (Pestana.solicitar, 'Solicitar', '+', '/solicitar'),
  (Pestana.avisos, 'Avisos', '◔', '/avisos'),
  (Pestana.perfil, 'Perfil', '◯', '/perfil'),
];

Pestana _pestanaDe(String ruta) {
  if (ruta.startsWith('/solicitar') || ruta.startsWith('/pendiente')) return Pestana.solicitar;
  if (ruta.startsWith('/avisos')) return Pestana.avisos;
  if (ruta.startsWith('/perfil') || ruta.startsWith('/estudio')) return Pestana.perfil;
  return Pestana.inicio; // inicio, detalle, confirmada
}

final routerProvider = Provider<GoRouter>((ref) {
  final cambios = ValueNotifier<int>(0);
  ref.listen(sesionProvider.select((s) => s.estado), (_, _) => cambios.value++);
  ref.onDispose(cambios.dispose);
  final router = GoRouter(
    refreshListenable: cambios,
    redirect: (context, state) {
      final con = ref.read(sesionProvider).estado == EstadoSesion.con;
      final enLogin = state.matchedLocation == '/login';
      if (!con) return enLogin ? null : '/login';
      return enLogin ? '/' : null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) => _Marco(ruta: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: '/', builder: (_, _) => const InicioScreen()),
          GoRoute(path: '/detalle/:id', builder: (_, s) => DetalleScreen(s.pathParameters['id']!)),
          GoRoute(path: '/solicitar', builder: (_, s) => SolicitarScreen(reprogramar: s.uri.queryParameters['reprogramar'])),
          GoRoute(path: '/pendiente', builder: (_, _) => const PendienteScreen()),
          GoRoute(path: '/confirmada/:id', builder: (_, s) => ConfirmadaScreen(s.pathParameters['id']!)),
          GoRoute(path: '/avisos', builder: (_, _) => const AvisosScreen()),
          GoRoute(path: '/perfil', builder: (_, _) => const PerfilScreen()),
          GoRoute(path: '/estudio', builder: (_, _) => const EstudioScreen()),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

/// Marco con la barra de pestanas (72 px) bajo cada pantalla menos el login.
class _Marco extends StatelessWidget {
  const _Marco({required this.ruta, required this.child});
  final String ruta;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final activa = _pestanaDe(ruta);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: Col.bg,
        body: SafeArea(
          bottom: false,
          child: Column(children: [
            Expanded(child: child),
            Container(
              height: 72 + MediaQuery.of(context).padding.bottom,
              padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
              decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Col.line))),
              child: Row(children: [
                for (final (p, etiqueta, icono, ruta) in _pestanas)
                  Expanded(
                    child: Semantics(
                      button: true, selected: p == activa, label: etiqueta, excludeSemantics: true,
                      child: InkWell(
                        onTap: () {
                          context.go('/');
                          if (p != Pestana.inicio) context.push(ruta);
                        },
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 56),
                          alignment: Alignment.center,
                          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Text(icono, style: TextStyle(fontSize: 20, color: p == activa ? Col.pri : Col.ink3)),
                            const SizedBox(height: 2),
                            Text(etiqueta, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: p == activa ? Col.pri : Col.ink3)),
                          ]),
                        ),
                      ),
                    ),
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
