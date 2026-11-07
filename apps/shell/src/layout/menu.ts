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

export const MENU_BY_ROLE: Record<string, MenuGroup[]> = {
  recepcion: [
    {
      heading: 'Recepción',
      items: [
        inicio,
        { label: 'Pacientes', to: '/clinica#/pacientes' },
        { label: 'Registrar paciente', to: '/clinica#/pacientes/nuevo' },
        { label: 'Agenda general', to: '/clinica#/agenda' },
        { label: 'Reservar cita', to: '/clinica#/reservar' },
      ],
    },
  ],
  medico: [
    {
      heading: 'Atención médica',
      items: [
        inicio,
        { label: 'Mi agenda', to: '/clinica#/agenda-medico' },
        { label: 'Historias clínicas', to: '/clinica#/historia' },
        { label: 'Estudios e imágenes', to: '/clinica#/estudios' },
      ],
    },
  ],
  caja: [
    {
      heading: 'Caja',
      items: [
        inicio,
        { label: 'Caja y cargos', to: '/clinica#/caja' },
        { label: 'Registrar cobro', to: '/clinica#/cobro' },
        { label: 'Movimientos y balance', to: '/clinica#/movimientos' },
      ],
    },
  ],
  administrador: [
    {
      heading: 'Administración',
      items: [
        inicio,
        { label: 'Usuarios y roles', to: '/admin/usuarios' },
        { label: 'Sesiones y seguridad', to: '/admin/seguridad' },
        { label: 'Horarios médicos', to: '/clinica#/horarios' },
        { label: 'Tarifario', to: '/clinica#/tarifario' },
        { label: 'Notificaciones', to: '/clinica#/historial' },
        { label: 'Estado de servicios', to: '/admin/servicios' },
      ],
    },
    {
      heading: 'Gestión empresarial',
      items: [
        { label: 'Dashboard', to: '/gestion' },
        { label: 'Machine Learning', to: '/gestion#/ml' },
        { label: 'Asistente de reportes', to: '/gestion#/asistente' },
        { label: 'Alertas', to: '/gestion#/alertas', badge: 'alertas' },
        { label: 'Políticas', to: '/gestion#/politicas' },
      ],
    },
  ],
};

/** Orden de prioridad cuando un usuario tiene varios roles. */
export const ROLE_ORDER = ['administrador', 'medico', 'recepcion', 'caja'];

export const ROLE_LABEL: Record<string, string> = {
  administrador: 'Administrador',
  medico: 'Médico',
  recepcion: 'Recepción',
  caja: 'Caja',
  paciente: 'Paciente',
};

export function primaryRole(roles: string[]): string | undefined {
  return ROLE_ORDER.find((r) => roles.includes(r));
}

/** Grupos de menu de todos los roles del usuario; "Inicio" solo aparece en el primer grupo. */
export function menuFor(roles: string[]): MenuGroup[] {
  const grupos = ROLE_ORDER.filter((r) => roles.includes(r)).flatMap((r) => MENU_BY_ROLE[r]);
  return grupos.map((g, i) => (i === 0 ? g : { ...g, items: g.items.filter((it) => it.to !== '/') }));
}
