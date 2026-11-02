import pg from 'pg';

let pool: pg.Pool | undefined;

/** Pool perezoso hacia la base ms7_inteligencia (MS7_DATABASE_URL o variables POSTGRES_*). */
export function pool_(): pg.Pool {
  if (!pool) {
    const url = process.env.MS7_DATABASE_URL;
    pool = new pg.Pool(
      url
        ? { connectionString: url, max: 5 }
        : {
            host: process.env.POSTGRES_HOST ?? 'localhost',
            port: Number(process.env.POSTGRES_PORT ?? 5432),
            user: process.env.POSTGRES_USER ?? 'sigec',
            password: process.env.POSTGRES_PASSWORD ?? '',
            database: process.env.MS7_DATABASE ?? 'ms7_inteligencia',
            max: 5,
          },
    );
  }
  return pool;
}

export async function cerrarPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
