#!/usr/bin/env node
/* ==========================================================================
   aplicar_esquema.js — Aplica supabase/schema.sql al proyecto de Supabase.

   El esquema es idempotente: se puede correr las veces que haga falta.

   Dos formas de autenticarse, ninguna de las dos deja la credencial escrita
   en el repositorio:

   1) Token de acceso personal (recomendado)
      Se crea en https://supabase.com/dashboard/account/tokens
        set SUPABASE_ACCESS_TOKEN=sbp_...        (Windows, cmd)
        $env:SUPABASE_ACCESS_TOKEN="sbp_..."     (PowerShell)
        export SUPABASE_ACCESS_TOKEN=sbp_...     (bash)
      node supabase/aplicar_esquema.js

   2) Cadena de conexión a la base
      Se copia de Project Settings → Database → Connection string (URI)
        set DATABASE_URL=postgresql://postgres.<ref>:<clave>@<host>:5432/postgres
      node supabase/aplicar_esquema.js
      Esta vía descarga el cliente "pg" con npx la primera vez.

   Opciones:
      --verificar   solo informa qué falta, sin escribir nada
      --ref <id>    referencia del proyecto (por defecto la de js/config.js)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_SQL = path.join(__dirname, 'schema.sql');

const args = process.argv.slice(2);
const soloVerificar = args.includes('--verificar');
const refArg = args.indexOf('--ref') >= 0 ? args[args.indexOf('--ref') + 1] : null;

// Tablas y columnas que este esquema agrega, para poder verificar el resultado
const TABLAS = ['perfiles', 'clientes', 'distribuidoras', 'proyectos', 'empresa', 'propuestas', 'productos', 'auditoria'];
const COLUMNAS_PIPELINE = ['estado_comercial', 'probabilidad', 'motivo_perdida', 'fecha_envio', 'fecha_cierre', 'eliminado_en'];

function leerConfig() {
  const cfg = fs.readFileSync(path.join(RAIZ, 'js', 'config.js'), 'utf8');
  const url = (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1] || '';
  const anon = (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1] || '';
  const ref = refArg || (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
  return { url, anon, ref };
}

/** Consulta el estado actual usando la clave pública: no necesita credenciales extra. */
async function verificar(cfg) {
  const cab = { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon };
  const faltan = { tablas: [], columnas: [] };

  for (const t of TABLAS) {
    const r = await fetch(`${cfg.url}/rest/v1/${t}?select=*&limit=1`, { headers: cab });
    if (r.status === 404) faltan.tablas.push(t);
  }
  if (faltan.tablas.indexOf('proyectos') < 0) {
    for (const c of COLUMNAS_PIPELINE) {
      const r = await fetch(`${cfg.url}/rest/v1/proyectos?select=${c}&limit=1`, { headers: cab });
      const cuerpo = await r.text();
      if (/does not exist|42703/.test(cuerpo)) faltan.columnas.push(c);
    }
  }
  return faltan;
}

function informar(faltan) {
  if (!faltan.tablas.length && !faltan.columnas.length) {
    console.log('  La base ya tiene todo el esquema aplicado.');
    return true;
  }
  if (faltan.tablas.length) console.log('  Faltan tablas:   ' + faltan.tablas.join(', '));
  if (faltan.columnas.length) console.log('  Faltan columnas: proyectos.' + faltan.columnas.join(', proyectos.'));
  return false;
}

/** Vía 1: API de gestión de Supabase con un token de acceso personal. */
async function aplicarConToken(cfg, sql, token) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    if (r.status === 401) throw new Error('El token de acceso no es válido o venció.');
    if (r.status === 404) throw new Error('No se encontró el proyecto ' + cfg.ref + ' con ese token.');
    throw new Error('La API respondió ' + r.status + ': ' + cuerpo.slice(0, 400));
  }
  return cuerpo;
}

/** Vía 2: conexión directa a Postgres. Descarga el cliente "pg" si hace falta. */
async function aplicarConPostgres(sql, cadena) {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch (e) {
    console.log('  Instalando el cliente de Postgres (una sola vez)…');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--no-save', '--silent', 'pg'], { cwd: RAIZ, stdio: 'inherit' });
    ({ Client } = require(path.join(RAIZ, 'node_modules', 'pg')));
  }
  const cliente = new Client({ connectionString: cadena, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
  return 'ok';
}

async function main() {
  const cfg = leerConfig();
  if (!cfg.url || !cfg.ref) {
    console.error('No se pudo leer la URL del proyecto desde js/config.js');
    process.exit(1);
  }

  console.log('Proyecto de Supabase: ' + cfg.ref);
  console.log('\nEstado actual:');
  const antes = await verificar(cfg);
  const completo = informar(antes);

  if (soloVerificar) process.exit(completo ? 0 : 1);
  if (completo) {
    console.log('\nNo hay nada que aplicar.');
    process.exit(0);
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const cadena = process.env.DATABASE_URL;
  if (!token && !cadena) {
    console.error('\nFalta la credencial. Definí una de estas variables de entorno:');
    console.error('  SUPABASE_ACCESS_TOKEN   token personal de https://supabase.com/dashboard/account/tokens');
    console.error('  DATABASE_URL            cadena de conexión de Project Settings → Database');
    console.error('\nO pegá el contenido de supabase/schema.sql en el editor SQL del panel de Supabase.');
    process.exit(1);
  }

  const sql = fs.readFileSync(ARCHIVO_SQL, 'utf8');
  console.log('\nAplicando schema.sql (' + Math.round(sql.length / 1024) + ' KB)…');

  if (token) await aplicarConToken(cfg, sql, token);
  else await aplicarConPostgres(sql, cadena);

  console.log('\nEstado después de aplicar:');
  const despues = await verificar(cfg);
  const ok = informar(despues);
  console.log(ok ? '\nEsquema aplicado correctamente.' : '\nQuedaron cosas sin aplicar: revisá el error de arriba.');
  process.exit(ok ? 0 : 1);
}

main().catch(e => {
  console.error('\nError: ' + e.message);
  process.exit(1);
});
