import 'package:flutter/material.dart';

/// Tokens del diseno SIGEC (copia de packages/design-tokens/tokens.js).
class Col {
  static const bg = Color(0xFFF2F5F6), surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF12212B), ink2 = Color(0xFF41535D), ink3 = Color(0xFF5A6B75);
  static const line = Color(0xFFDAE2E6), line2 = Color(0xFFEBF0F2), bd = Color(0xFF7A8C96);
  static const pri = Color(0xFF0B6572), priD = Color(0xFF084853), priT = Color(0xFFE0F0F2), priM = Color(0xFF35A9B8);
  static const side = Color(0xFF0E2A33), sideH = Color(0xFF173D49), sideT = Color(0xFFC5D9DE);
  static const ok = Color(0xFF1B6E46), okT = Color(0xFFE0F2E7);
  static const warn = Color(0xFF87490A), warnT = Color(0xFFFBEBD0);
  static const err = Color(0xFFA5251C), errT = Color(0xFFFBE2DF);
  static const info = Color(0xFF2C4C8A), infoT = Color(0xFFE3EAF6);
}

class Rad {
  static const sm = 6.0, md = 8.0, lg = 10.0, xl = 12.0, card = 14.0, pill = 999.0;
}

enum Tono { ok, warn, err, info, pri, neutral }

/// (fondo, texto) de cada tono.
(Color, Color) colorTono(Tono t) => switch (t) {
      Tono.ok => (Col.okT, Col.ok),
      Tono.warn => (Col.warnT, Col.warn),
      Tono.err => (Col.errT, Col.err),
      Tono.info => (Col.infoT, Col.info),
      Tono.pri => (Col.priT, Col.priD),
      Tono.neutral => (Col.line2, Col.ink2),
    };

/// Estilos de texto reutilizados (equivalen a `estilos` de ui.tsx).
class Txt {
  static const texto = TextStyle(color: Col.ink, fontSize: 15);
  static const suave = TextStyle(color: Col.ink3, fontSize: 12.5);
  static const fuerte = TextStyle(fontWeight: FontWeight.w700, color: Col.ink, fontSize: 15);
}

ThemeData temaSigec() => ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: Col.pri, primary: Col.pri, surface: Col.surface),
      scaffoldBackgroundColor: Col.bg,
      splashFactory: InkRipple.splashFactory,
      textTheme: Typography.blackMountainView.apply(bodyColor: Col.ink, displayColor: Col.ink),
    );
