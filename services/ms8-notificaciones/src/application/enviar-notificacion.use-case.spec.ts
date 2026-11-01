import { randomUUID } from 'node:crypto';
import type { Notificacion, RespuestaSaga } from '../domain/notificacion.js';
import { EnviarNotificacionUseCase, type NotificacionRepository, type NotificationSender } from './enviar-notificacion.use-case.js';

class FakeRepo implements NotificacionRepository {
  guardadas: { n: Notificacion; r: RespuestaSaga | null }[] = [];
  falla = false;
  async registrar(n: Notificacion, r: RespuestaSaga | null) {
    if (this.falla) throw new Error('DynamoDB caido');
    this.guardadas.push({ n, r });
  }
  async porCita() {
    return this.guardadas.map((g) => g.n);
  }
}
const ok: NotificationSender = { enviar: async () => ({ canal: 'simulado' }) };
const roto: NotificationSender = { enviar: async () => Promise.reject(new Error('canal caido')) };
const cmd = (tipo: 'CITA_CONFIRMADA' | 'CITA_CANCELADA' = 'CITA_CONFIRMADA') => ({
  mensajeId: randomUUID(),
  correlationId: randomUUID(),
  citaId: randomUUID(),
  pacienteId: randomUUID(),
  tipo,
});

describe('EnviarNotificacionUseCase', () => {
  it('confirmacion enviada: registra y responde ...enviada con el correlationId y causationId del comando', async () => {
    const repo = new FakeRepo();
    const c = cmd();
    const n = await new EnviarNotificacionUseCase(ok, repo, randomUUID).ejecutar(c);
    expect(n.estado).toBe('ENVIADA');
    const { r } = repo.guardadas[0];
    expect(r).toMatchObject({ type: 'notificaciones.cita-confirmada.enviada', correlationId: c.correlationId, causationId: c.mensajeId });
    expect(r!.payload).toEqual({ citaId: c.citaId, notificacionId: n.id, canal: 'simulado' });
  });

  it('un fallo del canal no lanza: queda FALLIDA y responde ...fallida', async () => {
    const repo = new FakeRepo();
    const c = cmd();
    const n = await new EnviarNotificacionUseCase(roto, repo, randomUUID).ejecutar(c);
    expect(n).toMatchObject({ estado: 'FALLIDA', error: 'canal caido' });
    expect(repo.guardadas[0].r).toMatchObject({ type: 'notificaciones.cita-confirmada.fallida' });
    expect(repo.guardadas[0].r!.payload).toEqual({ citaId: c.citaId, motivo: 'canal caido' });
  });

  it('la cancelacion se registra pero no genera respuesta', async () => {
    const repo = new FakeRepo();
    await new EnviarNotificacionUseCase(ok, repo, randomUUID).ejecutar(cmd('CITA_CANCELADA'));
    expect(repo.guardadas[0].n.tipo).toBe('CITA_CANCELADA');
    expect(repo.guardadas[0].r).toBeNull();
  });

  it('un error de infraestructura se propaga (el consumidor reintenta)', async () => {
    const repo = new FakeRepo();
    repo.falla = true;
    await expect(new EnviarNotificacionUseCase(ok, repo, randomUUID).ejecutar(cmd())).rejects.toThrow('DynamoDB caido');
  });
});
