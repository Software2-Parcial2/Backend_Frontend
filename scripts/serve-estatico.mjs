#!/usr/bin/env node
// Servidor estatico minimo para probar un frontend ya compilado (p. ej. el remoto Angular en :4201): CORS abierto, sin cache y con
// respaldo a index.html. Lee los archivos en cada peticion, asi se puede recompilar sin reiniciarlo.
//   node scripts/serve-estatico.mjs apps/remote-angular/dist/remote-angular/browser 4201
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [dirArg, puertoArg] = process.argv.slice(2);
if (!dirArg || !puertoArg) {
  console.error('uso: serve-estatico.mjs <directorio> <puerto>');
  process.exit(2);
}
const raiz = resolve(dirArg);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let archivo = join(raiz, ruta);
  if (!archivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(archivo)).isDirectory()) archivo = join(archivo, 'index.html');
  } catch {
    if (extname(ruta)) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('no existe'); return; }
    archivo = join(raiz, 'index.html');
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).end(cuerpo);
  } catch {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('no existe');
  }
}).listen(Number(puertoArg), () => console.log(`sirviendo ${raiz} en http://localhost:${puertoArg}`));
