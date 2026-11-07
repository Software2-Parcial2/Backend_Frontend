// Tokens del diseno SIGEC. Copia de packages/design-tokens/tokens.js (esta app usa npm, no el workspace de pnpm).
// Si cambias un valor, cambialo tambien alli y en sigec.css.
export const colors = {
  bg: '#F2F5F6', surface: '#FFFFFF', ink: '#12212B', ink2: '#41535D', ink3: '#5A6B75',
  line: '#DAE2E6', line2: '#EBF0F2', bd: '#7A8C96',
  pri: '#0B6572', priD: '#084853', priT: '#E0F0F2', priM: '#35A9B8',
  side: '#0E2A33', sideH: '#173D49', sideT: '#C5D9DE',
  ok: '#1B6E46', okT: '#E0F2E7', warn: '#87490A', warnT: '#FBEBD0',
  err: '#A5251C', errT: '#FBE2DF', info: '#2C4C8A', infoT: '#E3EAF6',
} as const;

// Public Sans / IBM Plex Mono no se empaquetan todavia (expo-font pendiente): se usa la fuente del sistema.
export const fonts = { sans: undefined, mono: 'monospace' } as const;
export const radius = { sm: 6, md: 8, lg: 10, xl: 12, card: 14, pill: 999 } as const;
export type Tono = 'ok' | 'warn' | 'err' | 'info' | 'pri' | 'neutral';
