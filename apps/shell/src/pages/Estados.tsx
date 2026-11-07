import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

function Estado({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="page">
      <div className="card col" style={{ maxWidth: 520, gap: 10 }} role="alert">
        <h1 className="h1">{titulo}</h1>
        <p className="ink2">{texto}</p>
        <div className="fx wrap">{children}</div>
      </div>
    </div>
  );
}

export const NoEncontrada = () => (
  <Estado titulo="Página no encontrada" texto="La dirección no existe o fue movida.">
    <Link className="btn pri" to="/">Ir al inicio</Link>
  </Estado>
);

export const SinPermiso = () => (
  <Estado titulo="Sin permiso (403)" texto="Tu rol no tiene acceso a esta sección. Si crees que es un error, pide acceso al administrador.">
    <Link className="btn pri" to="/">Ir al inicio</Link>
  </Estado>
);
