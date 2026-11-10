import 'package:flutter/material.dart';

import '../api/errores.dart';
import '../api/formato.dart';
import '../theme.dart';

/// Chip de estado: punto + texto, nunca solo color.
class Chip2 extends StatelessWidget {
  const Chip2(this.texto, {super.key, this.tono = Tono.neutral});
  final String texto;
  final Tono tono;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = colorTono(tono);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Rad.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 6, height: 6, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(texto, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

class CardSigec extends StatelessWidget {
  const CardSigec({super.key, required this.children, this.onTap, this.label, this.padding = const EdgeInsets.symmetric(vertical: 14, horizontal: 16), this.centrado = false, this.fila = false, this.gap = 8});
  final List<Widget> children;
  final VoidCallback? onTap;
  final String? label;
  final EdgeInsets padding;
  final bool centrado, fila;
  final double gap;
  @override
  Widget build(BuildContext context) {
    final lista = <Widget>[for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(width: fila ? gap : 0, height: fila ? 0 : gap), children[i]]];
    final contenido = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(color: Col.surface, border: Border.all(color: Col.line), borderRadius: BorderRadius.circular(Rad.card)),
      child: fila
          ? Row(crossAxisAlignment: CrossAxisAlignment.center, children: lista)
          : Column(crossAxisAlignment: centrado ? CrossAxisAlignment.center : CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: lista),
    );
    if (onTap == null) return contenido;
    return Semantics(button: true, label: label, child: InkWell(borderRadius: BorderRadius.circular(Rad.card), onTap: onTap, child: contenido));
  }
}

enum TipoBoton { normal, pri, peligro, claro }

class Boton extends StatelessWidget {
  const Boton(this.texto, {super.key, required this.onTap, this.tipo = TipoBoton.normal, this.deshabilitado = false});
  final String texto;
  final VoidCallback onTap;
  final TipoBoton tipo;
  final bool deshabilitado;
  @override
  Widget build(BuildContext context) {
    final (bg, borde, fg) = switch (tipo) {
      TipoBoton.pri => (Col.pri, Col.pri, Colors.white),
      TipoBoton.peligro => (Colors.white, Col.err, Col.err),
      TipoBoton.claro => (Colors.white, Colors.white, Col.side),
      TipoBoton.normal => (Colors.white, Col.bd, Col.ink),
    };
    return Opacity(
      opacity: deshabilitado ? 0.55 : 1,
      child: Semantics(
        button: true, enabled: !deshabilitado, label: texto, excludeSemantics: true,
        child: Material(
          color: bg,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rad.xl), side: BorderSide(color: borde)),
          child: InkWell(
            borderRadius: BorderRadius.circular(Rad.xl),
            onTap: deshabilitado ? null : onTap,
            child: SizedBox(height: 52, width: double.infinity, child: Center(child: Text(texto, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: fg)))),
          ),
        ),
      ),
    );
  }
}

class Aviso extends StatelessWidget {
  const Aviso(this.titulo, {super.key, this.tono = Tono.info, this.texto});
  final String titulo;
  final String? texto;
  final Tono tono;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = colorTono(tono);
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Rad.md)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(titulo, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 14)),
          if (texto != null && texto!.isNotEmpty) ...[const SizedBox(height: 2), Text(texto!, style: const TextStyle(color: Col.ink, fontSize: 14))],
        ]),
      ),
    );
  }
}

class Fila extends StatelessWidget {
  const Fila(this.etiqueta, {super.key, this.valor, this.derecha});
  final String etiqueta;
  final String? valor;
  final Widget? derecha;
  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 40),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Col.line2))),
        child: Row(children: [
          Expanded(child: Text(etiqueta, style: const TextStyle(color: Col.ink3, fontSize: 15))),
          if (valor case final v?) Flexible(child: Text(v, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700, color: Col.ink, fontSize: 15))) else ?derecha,
        ]),
      );
}

class Interruptor extends StatelessWidget {
  const Interruptor({super.key, required this.valor, required this.onChanged, required this.label});
  final bool valor;
  final ValueChanged<bool> onChanged;
  final String label;
  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: Switch(
          value: valor, onChanged: onChanged, thumbColor: const WidgetStatePropertyAll(Colors.white),
          trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Col.pri : Col.bd),
          trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
        ),
      );
}

/// Barra superior de pantalla.
class Barra extends StatelessWidget {
  const Barra(this.titulo, {super.key, this.atras, this.derecha});
  final String titulo;
  final VoidCallback? atras;
  final Widget? derecha;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Col.line))),
        child: Row(children: [
          if (atras != null)
            Semantics(
              button: true, label: 'Volver', excludeSemantics: true,
              child: InkWell(onTap: atras, child: Container(width: 44, height: 44, margin: const EdgeInsets.only(right: 2), alignment: Alignment.center, child: const Text('‹', style: TextStyle(fontSize: 28, color: Col.ink, height: 1)))),
            ),
          Expanded(child: Semantics(header: true, child: Text(titulo, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Col.ink)))),
          ?derecha,
        ]),
      );
}

/// Contenido desplazable de una pantalla (padding 16, separacion 14).
class Cuerpo extends StatelessWidget {
  const Cuerpo({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: children.length,
          separatorBuilder: (_, _) => const SizedBox(height: 14),
          itemBuilder: (_, i) => children[i],
        ),
      );
}

class Cargando extends StatelessWidget {
  const Cargando({super.key, this.texto = 'Cargando…'});
  final String texto;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: Col.pri)),
          const SizedBox(height: 10),
          Text(texto, style: Txt.suave),
        ]),
      );
}

class ErrorApiW extends StatelessWidget {
  const ErrorApiW(this.error, {super.key});
  final ApiError error;
  @override
  Widget build(BuildContext context) {
    final t = switch (error.estado) { 0 => 'Sin conexión con el servidor', 403 => 'No tiene permiso para esto', 401 => 'Su sesión venció', _ => 'No se pudo completar' };
    final cuerpo = error.estado == 0 ? 'Revise su red e intente de nuevo.' : error.message;
    return Aviso(t, tono: Tono.err, texto: error.correlationId != null ? '$cuerpo\nCódigo de soporte: ${error.correlationId}' : cuerpo);
  }
}

class SinConexion extends StatelessWidget {
  const SinConexion({super.key, this.en});
  final int? en;
  @override
  Widget build(BuildContext context) => Aviso('Datos guardados en este teléfono',
      tono: Tono.warn,
      texto: 'No hay conexión con el servidor.${en != null ? ' Última sincronización: ${formatoFechaHora(en)}.' : ''}');
}

/// Boton de seleccion (hora, dia, especialidad...).
class Casilla extends StatelessWidget {
  const Casilla(this.texto, {super.key, this.activa = false, required this.onTap});
  final String texto;
  final bool activa;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true, selected: activa, label: texto, excludeSemantics: true,
        child: Material(
          color: activa ? Col.pri : Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rad.lg), side: BorderSide(color: activa ? Col.pri : Col.bd)),
          child: InkWell(
            borderRadius: BorderRadius.circular(Rad.lg),
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minWidth: 80), height: 48, padding: const EdgeInsets.symmetric(horizontal: 14), alignment: Alignment.center,
              child: Text(texto, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: activa ? Colors.white : Col.ink)),
            ),
          ),
        ),
      );
}

/// Casillas en filas que se reparten el ancho (como `flex: 1, flexWrap`).
class Casillas extends StatelessWidget {
  const Casillas({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Wrap(spacing: 8, runSpacing: 8, children: children);
}

String nombreEsp(String c) => c.isEmpty ? '—' : c[0].toUpperCase() + c.substring(1).replaceAll('_', ' ');

Tono tonoCita(String e) => switch (e) {
      'CONFIRMADA' => Tono.ok,
      'EN_SALA' => Tono.info,
      'ATENDIDA' => Tono.neutral,
      _ when e.startsWith('CANCEL') || e == 'NO_ASISTIO' || e == 'ANULADA' => Tono.err,
      _ => Tono.warn,
    };

String textoCita(String e) => const {
      'CONFIRMADA': 'Confirmada', 'EN_SALA': 'En sala', 'ATENDIDA': 'Atendida', 'NO_ASISTIO': 'No asistió',
      'CANCELADA_USUARIO': 'Cancelada', 'CANCELADA': 'No se confirmó', 'ANULADA': 'No se confirmó',
    }[e] ?? 'En proceso';
