import { HttpException, HttpStatus } from '@nestjs/common';

/** Ventana deslizante por usuario (en memoria; con varias replicas habria que moverla a Redis/DynamoDB). */
export class LimiteUso {
  private readonly usos = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly ventanaMs = 3_600_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  consumir(usuario: string): void {
    const t = this.ahora();
    const recientes = (this.usos.get(usuario) ?? []).filter((x) => t - x < this.ventanaMs);
    if (recientes.length >= this.max) {
      const espera = Math.ceil((this.ventanaMs - (t - recientes[0]!)) / 1000);
      throw new HttpException({ message: `Limite de ${this.max} consultas por hora alcanzado. Reintenta en ${espera} s.`, retryAfter: espera }, HttpStatus.TOO_MANY_REQUESTS);
    }
    recientes.push(t);
    this.usos.set(usuario, recientes);
  }
}
