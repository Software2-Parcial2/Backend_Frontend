import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStore } from '../../application/ports.js';

export interface S3Options {
  endpoint: string;
  /** Endpoint que veran los clientes en las URL prefirmadas (por defecto el mismo). */
  publicEndpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3 (SeaweedFS en desarrollo, S3 real en AWS). El bucket es PRIVADO: el acceso es con credenciales o con URL prefirmada temporal. */
export class S3ObjectStore implements ObjectStore {
  private readonly s3: S3Client;
  private readonly firmador: S3Client;

  constructor(o: S3Options) {
    const credentials = { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey };
    this.s3 = new S3Client({ endpoint: o.endpoint, region: o.region, forcePathStyle: true, credentials });
    this.firmador = new S3Client({ endpoint: o.publicEndpoint ?? o.endpoint, region: o.region, forcePathStyle: true, credentials });
  }

  async subir(bucket: string, key: string, cuerpo: Uint8Array, mime: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: cuerpo, ContentType: mime }));
  }

  urlTemporal(bucket: string, key: string, segundos: number): Promise<string> {
    return getSignedUrl(this.firmador, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: segundos });
  }
}
