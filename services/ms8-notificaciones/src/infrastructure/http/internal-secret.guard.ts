import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * Protege los endpoints /internal/** que llama n8n (no pasan por el gateway ni usan JWT): exigen la cabecera
 * `X-Sigec-Secret` = MS8_INTERNAL_SECRET. Si el secreto no esta configurado se rechaza todo (falla cerrado).
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env.MS8_INTERNAL_SECRET ?? '';
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const recibido = String(req.headers['x-sigec-secret'] ?? '');
    const a = Buffer.from(esperado);
    const b = Buffer.from(recibido);
    if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('secreto interno invalido');
    return true;
  }
}
