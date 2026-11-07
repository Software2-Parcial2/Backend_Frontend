import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { ContextStore } from './context';

/** Pantalla de entrada segun el rol (la misma que ofrece el menu del shell). */
const entradaPorRol: CanActivateFn = () => {
  const roles = inject(ContextStore).ctx()?.roles ?? [];
  const destino = roles.includes('medico') && !roles.includes('recepcion')
    ? 'agenda'
    : roles.includes('caja') && !roles.includes('recepcion') && !roles.includes('administrador')
      ? 'caja'
      : roles.includes('administrador') && !roles.includes('recepcion')
        ? 'historial'
        : 'pacientes';
  return inject(Router).parseUrl('/' + destino);
};

const pagina = <T>(load: () => Promise<T>) => load;

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [entradaPorRol], children: [] },
  { path: 'pacientes', loadComponent: pagina(() => import('./pages/pacientes').then((m) => m.Pacientes)) },
  { path: 'pacientes/nuevo', loadComponent: pagina(() => import('./pages/paciente-nuevo').then((m) => m.PacienteNuevo)) },
  { path: 'pacientes/ficha', loadComponent: pagina(() => import('./pages/paciente-ficha').then((m) => m.PacienteFicha)) },
  { path: 'agenda', loadComponent: pagina(() => import('./pages/agenda').then((m) => m.Agenda)) },
  { path: 'reservar', loadComponent: pagina(() => import('./pages/reservar').then((m) => m.Reservar)) },
  { path: 'cita', loadComponent: pagina(() => import('./pages/cita-detalle').then((m) => m.CitaDetalle)) },
  { path: 'historia', loadComponent: pagina(() => import('./pages/historia').then((m) => m.Historia)) },
  { path: 'consulta', loadComponent: pagina(() => import('./pages/consulta').then((m) => m.Consulta)) },
  { path: 'estudios', loadComponent: pagina(() => import('./pages/estudios').then((m) => m.Estudios)) },
  { path: 'resultado', loadComponent: pagina(() => import('./pages/resultado').then((m) => m.Resultado)) },
  { path: 'caja', loadComponent: pagina(() => import('./pages/caja').then((m) => m.Caja)) },
  { path: 'cobro', loadComponent: pagina(() => import('./pages/cobro').then((m) => m.Cobro)) },
  { path: 'historial', loadComponent: pagina(() => import('./pages/historial').then((m) => m.Historial)) },
  { path: '**', loadComponent: pagina(() => import('./pages/no-encontrada').then((m) => m.NoEncontrada)) },
];
