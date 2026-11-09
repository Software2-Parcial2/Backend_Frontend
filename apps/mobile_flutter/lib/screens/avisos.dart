import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/formato.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _txtAviso = {
  'CITA_CONFIRMADA': 'Cita confirmada', 'CITA_CANCELADA': 'Cita cancelada', 'CITA_REPROGRAMADA': 'Cita reprogramada',
  'RECORDATORIO': 'Recordatorio', 'RECORDATORIO_REFUERZO': 'Recordatorio', 'ESTUDIO_VALIDADO': 'Estudio validado',
};

class AvisosScreen extends ConsumerWidget {
  const AvisosScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.leer(pMe());
    final pet = me.datos == null ? null : pAvisos(me.datos!.id);
    final avisos = ref.leer(pet);
    Future<void> marcar() async {
      final ids = [for (final a in avisos.datos ?? []) if (!a.leida) a.id];
      if (ids.isEmpty || pet == null) return;
      try {
        await ref.read(apiProvider).post('/api/notificaciones/leidas', {'ids': ids});
      } catch (_) {}
      ref.recargar(pet);
    }

    return Column(children: [
      Barra('Avisos',
          derecha: Semantics(button: true, child: InkWell(onTap: marcar, child: Container(constraints: const BoxConstraints(minHeight: 44), alignment: Alignment.center, child: const Text('Marcar leídos', style: Txt.fuerte))))),
      Cuerpo(children: [
        if (avisos.desactualizado) SinConexion(en: avisos.guardadoEn),
        if (avisos.error != null) ErrorApiW(avisos.error!),
        if (avisos.datos == null && avisos.error == null) const Cargando(),
        if (avisos.datos != null)
          CardSigec(children: [
            if (avisos.datos!.isEmpty) const Text('Todavía no tiene avisos.', style: Txt.suave),
            for (final a in avisos.datos!)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Col.line2))),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(width: 10, height: 10, margin: const EdgeInsets.only(top: 6, right: 12), decoration: BoxDecoration(shape: BoxShape.circle, color: !a.leida ? Col.pri : Colors.transparent)),
                  Expanded(child: Row(children: [Expanded(child: Text(_txtAviso[a.tipo] ?? a.tipo, style: Txt.fuerte)), Text(formatoFechaHora(a.creadaEn), style: Txt.suave)])),
                ]),
              ),
          ]),
        const Text('Los avisos no incluyen diagnósticos ni estudios. El detalle se consulta dentro de la app.', style: Txt.suave),
      ]),
    ]);
  }
}
