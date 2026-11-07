/** Menu lateral por rol de Keycloak (realm_access.roles). Los remotos usan rutas con hash: /clinica#/pacientes. */
export interface MenuItem {
  label: string;
  to: string;
  badge?: string;
}
export interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

const inicio: MenuItem = { label: 'Inicio', to: '/' };

export const MENU_BY_ROLE: Record<string, MenuGroup> = {
  recepcion: {
    heading: 'Recepción',
    items: [
      inicio,
      { label: 'Pacientes', to: '/clinica#/pacientes' },
      { label: 'Registrar paciente', to: '/clinica#/pacientes/nuevo' },
      { label: 'Agenda general', to: '/clinica#/agenda' },
      { label: 'Reservar cita', to: '/clinica#/reservar' },
    ],
  },
  medico: {
    heading: 'Médico',
    items: [
      inicio,
      { label: 'Mi agenda', to: '/clinica#/agenda-medico' },
      { label: 'Historia clínica', to: '/clinica#/historia' },
      { label: 'Estudios radiológicos', to: '/clinica#/estudios' },
    ],
  },
  caja: {
    heading: 'Caja',
    items: [
      inicio,
      { label: 'Caja y cargos', to: '/clinica#/caja' },
      { label: 'Registrar cobro', to: '/clinica#/cobro' },
      { label: 'Movimientos y balance', to: '/clinica#/movimientos' },
    ],
  },
  administrador: {
    heading: 'Dirección',
    items: [
      inicio,
      { label: 'Dashboard', to: '/gestion' },
      { label: 'Machine Learning', to: '/gestion#/ml' },
      { label: 'Asistente de reportes', to: '/gestion#/asistente' },
      { label: 'Alertas', to: '/gestion#/alertas', badge: '3' },
      { label: 'Notificaciones', to: '/clinica#/historial' },
    ],
  },
};

/** Orden de prioridad cuando un usuario tiene varios roles. */
export const ROLE_ORDER = ['administrador', 'medico', 'recepcion', 'caja'];

export const ROLE_LABEL: Record<string, string> = {
  administrador: 'Dirección médica',
  medico: 'Médico',
  recepcion: 'Recepción',
  caja: 'Caja',
  paciente: 'Paciente',
};

export function primaryRole(roles: string[]): string | undefined {
  return ROLE_ORDER.find((r) => roles.includes(r));
}

/** Une los grupos de todos los roles del usuario sin repetir entradas. */
export function menuFor(roles: string[]): MenuGroup[] {
  return ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => MENU_BY_ROLE[r]);
}
