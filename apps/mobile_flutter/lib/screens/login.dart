import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sesion/sesion.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sesionProvider);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Container(
        color: Col.side,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 28),
            child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Semantics(header: true, child: const Text('SIGEC', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 1))),
              const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Sus citas y avisos, en su teléfono', style: TextStyle(color: Colors.white, fontSize: 34, height: 38 / 34, fontWeight: FontWeight.w700)),
                SizedBox(height: 14),
                Text('Inicie sesión con su cuenta de la clínica para ver sus citas, solicitar una nueva y recibir notificaciones.',
                    style: TextStyle(color: Col.sideT, fontSize: 16, height: 24 / 16)),
              ]),
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (s.error != null) Semantics(liveRegion: true, child: Text(s.error!, style: const TextStyle(color: Color(0xFFFFB4B4), fontSize: 14))),
                if (s.error != null) const SizedBox(height: 12),
                if (s.estado == EstadoSesion.cargando)
                  const DefaultTextStyle(style: TextStyle(color: Col.sideT), child: Cargando(texto: 'Comprobando su sesión…'))
                else
                  Boton('Iniciar sesión', tipo: TipoBoton.claro, onTap: () => ref.read(sesionProvider.notifier).entrar()),
                const SizedBox(height: 12),
                const Text('Se abrirá el inicio de sesión seguro de la clínica', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF93B0B8), fontSize: 13)),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
