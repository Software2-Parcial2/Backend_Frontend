# design.md · @sigec/design-tokens

Fuente de verdad visual de SIGEC. Origen: diseno "Mapa de pantallas SIGEC" (artifact de Claude Design, `project/sigec.css`).
Los design.md de cada app (`apps/*/design.md`) remiten aqui y solo documentan lo propio de su canal.

## Principios
- **Un solo lenguaje, tres canales:** shell web del personal (sidebar), PWA del paciente (topbar) y app movil (tabbar).
- **Module Federation:** los tokens son *CSS custom properties* (heredan por el DOM, no hay codigo compartido) y los componentes
  estan anidados bajo `.sigec` (CSS nesting). Ningun estilo global en remotos (regla 6 de `contracts/microfrontend-contract.md`).
  Shell y remotos montan su arbol dentro de `<div class="sigec">`.
- **Accesibilidad:** texto 4,5:1, objetivos tactiles >= 44 px en PWA/movil, `button`/`a`/`input`+`label` reales, foco visible (`:focus-visible`).
  Los estados nunca dependen solo del color: el chip lleva punto + texto.

## Tokens
| Variable | Valor | Uso |
|---|---|---|
| `--bg` / `--surface` | `#F2F5F6` / `#FFFFFF` | fondo de pagina / tarjetas |
| `--ink`, `--ink2`, `--ink3` | `#12212B`, `#41535D`, `#5A6B75` | texto principal, secundario, tenue |
| `--line`, `--line2`, `--bd` | `#DAE2E6`, `#EBF0F2`, `#7A8C96` | bordes, separadores, borde de controles |
| `--pri`, `--pri-d`, `--pri-t`, `--pri-m` | `#0B6572`, `#084853`, `#E0F0F2`, `#35A9B8` | accion, hover/texto oscuro, fondo suave, acento |
| `--side`, `--side-h`, `--side-t` | `#0E2A33`, `#173D49`, `#C5D9DE` | sidebar del shell |
| `--ok/warn/err/info` y `-t` | verde, ambar, rojo, azul + fondo suave | estados (chips, banners) |

Tipografia: **Public Sans** (400-700) y **IBM Plex Mono** (codigos, horas, N.° de historia). Se cargan con `<link>` de Google Fonts
en cada `index.html` (dependencia externa; alternativa offline: `@fontsource`, ver `docs/PENDIENTES.md`).
Radios: 6 (tag), 8 (boton/campo), 10 (tarjeta), 14 (tarjeta movil), 999 (chip).

## Componentes (clase -> uso)
`.card` `.card.flush` `.kpi` `.tbl` `.chip(.ok/.warn/.err/.info/.pri)` `.tag` `.btn(.pri/.dng/.gh/.s)` `.field` `.in` `.search` `.tabs/.tab`
`.seg` `.sw` `.slot(.on/.off)` `.pb` `.banner(.warn/.err/.ok)` `.li` `.tl/.tli/.dot` `.steps/.st` `.msg` `.code` `.xray/.heat` `.disc`
`.vb` (barras verticales) `.hb` (barras horizontales). Layout del personal: `.app .side .nav .main .top .page .ph`. Layout PWA: `.pw .pt .pn .pc`.

## Uso
- Web (React/Vue/Angular): `import '@sigec/design-tokens/sigec.css'` (Angular: ruta relativa en `angular.json`, tiene lockfile propio).
- React Native: `import { colors, fonts, radius } from '@sigec/design-tokens'` o la copia `apps/mobile/src/theme.ts`.
- `.sigec-root` da fondo/tipografia a una app completa (shell, PWA); los remotos NO lo usan.
- Si cambias un valor: editar `sigec.css`, `tokens.js` y `apps/mobile/src/theme.ts` a la vez.
