#!/usr/bin/env node
// Crea (de forma repetible) el bucket privado de radiografias en el S3 local (SeaweedFS con autenticacion).
//   make s3-init        (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_RADIOGRAFIAS salen del .env)
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET_RADIOGRAFIAS ?? 'radiografias';
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.AWS_REGION ?? 'sa-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
});

for (let intento = 1; ; intento++) {
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`bucket ${bucket}: ya existe`);
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket })); // privado: SeaweedFS no concede acceso anonimo con la autenticacion activa
      console.log(`bucket ${bucket}: creado`);
    }
    break;
  } catch (e) {
    if (intento >= 15) throw e;
    await new Promise((r) => setTimeout(r, 2000)); // SeaweedFS tarda unos segundos en elegir lider
  }
}
