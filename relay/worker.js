/**
 * AEGIS 404 — relay CORS propio (Cloudflare Workers)
 *
 * Trae el HTML de una URL pública y lo devuelve con cabeceras CORS abiertas,
 * para que AEGIS 404 (una app estática) pueda analizarlo en el navegador.
 *
 * Despliegue: ver relay/README.md
 * Uso desde AEGIS: pega  https://TU-WORKER.workers.dev/?url=  en Opciones avanzadas.
 */

/* Solo respondemos a estos orígenes. Cambia/añade el tuyo.
   Un relay abierto a todo internet es un proxy abierto: lo acabarán abusando. */
const ALLOWED_ORIGINS = [
  'https://ivan7800.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

/* Rangos que un atacante usaría para hacer SSRF contra tu red o la de Cloudflare. */
const BLOCKED_HOSTNAMES = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'metadata.google.internal', '169.254.169.254',
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB: ninguna página HTML legítima pasa de aquí
const TIMEOUT_MS = 15000;

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(h)) return true;
  if (h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  // IPv4 privadas / loopback / link-local
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [ +m[1], +m[2] ];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  if (h.startsWith('[') || h.includes(':')) return true; // IPv6 literal: no lo tratamos
  return false;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const fail = (msg, status, origin) =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return fail('Solo se admite GET', 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return fail('Origen no autorizado', 403, origin);
    }

    const raw = new URL(request.url).searchParams.get('url');
    if (!raw) return fail('Falta el parámetro ?url=', 400, origin);

    let target;
    try { target = new URL(raw); }
    catch { return fail('URL no válida', 400, origin); }

    if (!/^https?:$/.test(target.protocol)) {
      return fail('Solo se admiten esquemas http y https', 400, origin);
    }
    if (isPrivateHost(target.hostname)) {
      return fail('Destino no permitido (red privada o metadatos)', 403, origin);
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

    try {
      const upstream = await fetch(target.href, {
        method: 'GET',
        redirect: 'follow',
        signal: ctl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AEGIS404/2.1; +https://github.com/ivan7800/aegis-404)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      const len = Number(upstream.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return fail('La respuesta supera 5 MB', 413, origin);

      const body = await upstream.text();
      if (body.length > MAX_BYTES) return fail('La respuesta supera 5 MB', 413, origin);

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8', // texto plano: nunca se renderiza
          'X-Aegis-Upstream-Status': String(upstream.status),
          'X-Aegis-Final-Url': upstream.url || target.href,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          ...corsHeaders(origin),
        },
      });
    } catch (e) {
      const msg = e.name === 'AbortError' ? `Timeout tras ${TIMEOUT_MS / 1000}s` : (e.message || 'Error de red');
      return fail(msg, 502, origin);
    } finally {
      clearTimeout(timer);
    }
  },
};
