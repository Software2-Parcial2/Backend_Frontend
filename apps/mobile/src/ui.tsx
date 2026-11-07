import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, type Tono } from './theme';

const TONOS: Record<Tono, { bg: string; fg: string }> = {
  ok: { bg: colors.okT, fg: colors.ok },
  warn: { bg: colors.warnT, fg: colors.warn },
  err: { bg: colors.errT, fg: colors.err },
  info: { bg: colors.infoT, fg: colors.info },
  pri: { bg: colors.priT, fg: colors.priD },
  neutral: { bg: colors.line2, fg: colors.ink2 },
};

/** Chip de estado: punto + texto, nunca solo color. */
export function Chip({ tono = 'neutral', children }: { tono?: Tono; children: ReactNode }) {
  const t = TONOS[tono];
  return (
    <View style={[s.chip, { backgroundColor: t.bg }]}>
      <View style={[s.chipDot, { backgroundColor: t.fg }]} />
      <Text style={[s.chipTxt, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.card, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Boton({ children, onPress, tipo = 'normal', disabled }: { children: string; onPress: () => void; tipo?: 'normal' | 'pri' | 'peligro' | 'claro'; disabled?: boolean }) {
  const st = tipo === 'pri' ? s.btnPri : tipo === 'peligro' ? s.btnDng : tipo === 'claro' ? s.btnClaro : null;
  const txt = tipo === 'pri' ? { color: '#fff' } : tipo === 'peligro' ? { color: colors.err } : tipo === 'claro' ? { color: colors.side } : null;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.btn, st, disabled && { opacity: 0.55 }]}>
      <Text style={[s.btnTxt, txt]}>{children}</Text>
    </Pressable>
  );
}

export function Aviso({ tono = 'info', titulo, children }: { tono?: 'info' | 'warn' | 'ok' | 'err'; titulo: string; children?: ReactNode }) {
  const t = TONOS[tono];
  return (
    <View accessibilityRole="alert" style={[s.banner, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: 14 }}>{titulo}</Text>
      {children ? <Text style={{ color: colors.ink, fontSize: 14 }}>{children}</Text> : null}
    </View>
  );
}

export function Fila({ etiqueta, valor, children }: { etiqueta: string; valor?: string; children?: ReactNode }) {
  return (
    <View style={s.fila}>
      <Text style={{ color: colors.ink3, fontSize: 15 }}>{etiqueta}</Text>
      <View style={{ flex: 1 }} />
      {valor ? <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 15 }}>{valor}</Text> : children}
    </View>
  );
}

export function Interruptor({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  return <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ false: colors.bd, true: colors.pri }} thumbColor="#fff" />;
}

/** Barra superior de pantalla. */
export function Barra({ titulo, atras, derecha }: { titulo: string; atras?: () => void; derecha?: ReactNode }) {
  return (
    <View style={s.barra}>
      {atras ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={atras} style={s.atras}>
          <Text style={{ fontSize: 28, color: colors.ink, lineHeight: 30 }}>‹</Text>
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={s.barraTit}>{titulo}</Text>
      <View style={{ flex: 1 }} />
      {derecha}
    </View>
  );
}

export const estilos = {
  cuerpo: { flex: 1, padding: 16, gap: 14 } as ViewStyle,
  texto: { color: colors.ink, fontSize: 15 },
  suave: { color: colors.ink3, fontSize: 12.5 },
  fuerte: { fontWeight: '700', color: colors.ink } as const,
};

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  btn: { height: 52, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.bd, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnPri: { backgroundColor: colors.pri, borderColor: colors.pri },
  btnDng: { borderColor: colors.err },
  btnClaro: { backgroundColor: '#fff', borderColor: '#fff' },
  btnTxt: { fontSize: 16, fontWeight: '700', color: colors.ink },
  banner: { padding: 12, borderRadius: radius.md, gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', minHeight: 40, borderBottomWidth: 1, borderBottomColor: colors.line2 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  atras: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  barraTit: { fontSize: 20, fontWeight: '700', color: colors.ink },
});
