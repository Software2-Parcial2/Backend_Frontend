import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Avisos, Confirmada, Detalle, Estudio, Inicio, Login, Pendiente, Perfil, Solicitar, type Nav, type Pantalla } from './src/screens';
import { colors } from './src/theme';

type Pestana = 'inicio' | 'solicitar' | 'avisos' | 'perfil';
const PESTANAS: { id: Pestana; label: string; icono: string }[] = [
  { id: 'inicio', label: 'Citas', icono: '▦' },
  { id: 'solicitar', label: 'Solicitar', icono: '+' },
  { id: 'avisos', label: 'Avisos', icono: '◔' },
  { id: 'perfil', label: 'Perfil', icono: '◯' },
];
// Pantalla -> pestana resaltada.
const PESTANA_DE: Partial<Record<Pantalla, Pestana>> = {
  inicio: 'inicio', detalle: 'inicio', confirmada: 'inicio',
  solicitar: 'solicitar', pendiente: 'solicitar',
  avisos: 'avisos',
  perfil: 'perfil', estudio: 'perfil', 'estudio-rechazado': 'perfil',
};

export default function App() {
  // Navegacion minima por pila (sin dependencias nuevas). Reemplazable por React Navigation cuando haya mas pantallas.
  const [pila, setPila] = useState<Pantalla[]>(['login']);
  const actual = pila[pila.length - 1];
  const ir = useCallback((p: Pantalla) => setPila((s) => (p === 'login' || p === 'inicio' ? [p] : [...s, p])), []);
  const atras = useCallback(() => setPila((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const nav: Nav = { ir, atras };

  const pantalla = (() => {
    switch (actual) {
      case 'login': return <Login nav={nav} />;
      case 'detalle': return <Detalle nav={nav} />;
      case 'solicitar': return <Solicitar nav={nav} />;
      case 'pendiente': return <Pendiente nav={nav} />;
      case 'confirmada': return <Confirmada nav={nav} />;
      case 'avisos': return <Avisos />;
      case 'perfil': return <Perfil nav={nav} />;
      case 'estudio': return <Estudio nav={nav} />;
      case 'estudio-rechazado': return <Estudio nav={nav} rechazado />;
      default: return <Inicio nav={nav} />;
    }
  })();

  return (
    <SafeAreaView style={s.raiz}>
      <StatusBar style={actual === 'login' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>{pantalla}</View>
      {actual !== 'login' && (
        <View accessibilityRole="tablist" style={s.tabbar}>
          {PESTANAS.map((p) => {
            const on = PESTANA_DE[actual] === p.id;
            return (
              <Pressable key={p.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setPila(p.id === 'inicio' ? ['inicio'] : ['inicio', p.id])} style={s.tab}>
                <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: 20, color: on ? colors.pri : colors.ink3 }}>{p.icono}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: on ? colors.pri : colors.ink3 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.bg },
  tabbar: { height: 72, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
