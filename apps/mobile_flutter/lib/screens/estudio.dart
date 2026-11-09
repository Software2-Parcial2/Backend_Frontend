import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/formato.dart';
import '../models.dart';
import '../providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

class EstudioScreen extends ConsumerWidget {
  const EstudioScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final estudios = ref.leer(pEstudios());
    Future<void> ver(EstudioN e) async {
      String url = '';
      try {
        url = '${(await ref.read(apiProvider).getJson('/api/imagenes/${e.id}/url'))['url'] ?? ''}';
      } catch (_) {}
      if (url.isNotEmpty) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }

    return Column(children: [
      Barra('Mis estudios', atras: () => context.go('/perfil')),
      Cuerpo(children: [
        if (estudios.desactualizado) SinConexion(en: estudios.guardadoEn),
        if (estudios.error != null) ErrorApiW(estudios.error!),
        if (estudios.datos == null && estudios.error == null) const Cargando(),
        if (estudios.datos?.isEmpty ?? false) const CardSigec(children: [Text('Todavía no tiene informes validados.', style: Txt.suave)]),
        for (final e in estudios.datos ?? <EstudioN>[])
          CardSigec(children: [
            Row(children: [
              const Text('Radiografía de tórax', style: Txt.fuerte),
              const Spacer(),
              Chip2(e.validacion == 'VALIDADO' ? 'Informe validado' : 'En revisión', tono: e.validacion == 'VALIDADO' ? Tono.ok : Tono.warn),
            ]),
            Text(formatoFecha(e.creadaEn), style: Txt.suave),
            Text(e.informe ?? 'Su médico aún no valida este estudio.', style: const TextStyle(color: Col.ink2, fontSize: 15)),
            Boton('Ver imagen', onTap: () => ver(e)),
          ]),
        const Aviso('Subir un estudio previo', texto: 'Disponible en el portal web. Aquí aún no se puede elegir una imagen del teléfono.'),
      ]),
    ]);
  }
}
