import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/errores.dart';
import '../api/formato.dart';
import '../models.dart';
import '../providers.dart';
import '../sesion/sesion.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class PerfilScreen extends ConsumerStatefulWidget {
  const PerfilScreen({super.key});
  @override
  ConsumerState<PerfilScreen> createState() => _PerfilState();
}

class _PerfilState extends ConsumerState<PerfilScreen> {
  ApiError? _error;

  Future<void> _cambiar(String id, Prefs p, String canal, bool on) async {
    final pet = pPrefs(id);
    final canales = on ? [...p.canales, canal] : p.canales.where((c) => c != canal).toList();
    if (canales.isEmpty) return; // al menos un canal
    setState(() => _error = null);
    try {
      await ref.read(apiProvider).put('/api/notificaciones/preferencias/$id', {'canales': canales, 'tiposAviso': p.tiposAviso, 'antelacionHoras': p.antelacionHoras});
      ref.recargar(pet);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiError ? e : ApiError(0, mensajeAlterno: 'No se pudo guardar'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.leer(pMe());
    final p = me.datos;
    final prefs = ref.leer(p == null ? null : pPrefs(p.id));
    return Column(children: [
      const Barra('Perfil'),
      Cuerpo(children: [
        if (me.error != null) ErrorApiW(me.error!),
        if (p == null && me.error == null) const Cargando(),
        if (p != null) ...[
          if (me.desactualizado) SinConexion(en: me.guardadoEn),
          CardSigec(fila: true, gap: 14, children: [
            Container(
              width: 52, height: 52, alignment: Alignment.center, decoration: const BoxDecoration(color: Col.priT, shape: BoxShape.circle),
              child: Text(iniciales(p.nombre), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: Col.priD)),
            ),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.nombre, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Col.ink)),
              Text('${p.numeroHistoria} · ${p.documento}', style: Txt.suave),
            ])),
          ]),
          if (prefs.datos != null)
            CardSigec(children: [
              const Text('Avisos', style: Txt.fuerte),
              Fila('Correo electrónico', derecha: Interruptor(valor: prefs.datos!.canales.contains('EMAIL'), label: 'Avisos por correo electrónico', onChanged: (v) => _cambiar(p.id, prefs.datos!, 'EMAIL', v))),
              Fila('Telegram', derecha: Interruptor(valor: prefs.datos!.canales.contains('TELEGRAM'), label: 'Avisos por Telegram', onChanged: (v) => _cambiar(p.id, prefs.datos!, 'TELEGRAM', v))),
              Text(prefs.datos!.telegramVinculado ? 'Telegram vinculado.' : 'Telegram se vincula con un código de un solo uso desde el portal web.', style: Txt.suave),
            ]),
          if (_error != null) ErrorApiW(_error!),
          CardSigec(children: [
            Semantics(
              button: true,
              child: InkWell(
                onTap: () => context.push('/estudio'),
                child: Container(constraints: const BoxConstraints(minHeight: 56), child: const Row(children: [Text('Mis estudios', style: Txt.fuerte), Spacer(), Text('›', style: TextStyle(color: Col.ink3))])),
              ),
            ),
          ]),
        ],
        Boton('Cerrar sesión', onTap: () => ref.read(sesionProvider.notifier).salir()),
      ]),
    ]);
  }
}
