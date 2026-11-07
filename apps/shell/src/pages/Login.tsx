import { Link } from 'react-router-dom';

interface Props {
  onSignIn: () => void;
  expirada?: boolean;
}

/** Pantalla de inicio de sesion SSO (diseno m1-login / estado-sesion). La autenticacion la hace Keycloak. */
export function Login({ onSignIn, expirada }: Props) {
  return (
    <div className="center-page">
      <div className="card center-card" style={{ padding: 28 }}>
        <div className="brand" style={{ color: 'var(--ink)', padding: 0 }}>
          <span className="mk" />
          SIGEC
        </div>
        <div>
          <h1 className="h1">{expirada ? 'Tu sesión expiró' : 'Iniciar sesión'}</h1>
          <p className="sub">Clínica Médica Santa Cruz · acceso único con Keycloak</p>
        </div>
        {expirada && (
          <div className="banner warn" role="status">
            <div>
              <b>Por seguridad cerramos la sesión</b>
              <span>Vuelve a ingresar para continuar donde estabas.</span>
            </div>
          </div>
        )}
        <button type="button" className="btn pri" style={{ height: 46 }} onClick={onSignIn}>
          Ingresar con SSO
        </button>
        <Link to="/recuperar" className="b" style={{ textAlign: 'center', minHeight: 44, display: 'grid', placeItems: 'center' }}>¿Olvidó su contraseña?</Link>
      </div>
    </div>
  );
}
