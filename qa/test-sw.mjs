import fs from 'fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = n => { console.log(`  ✅ ${n}`); pass++; };
const no = (n, d) => { console.log(`  ❌ ${n}${d ? ' → ' + d : ''}`); fail++; };

const res = (body, okFlag = true) => ({
  ok: okFlag, body,
  clone() { return res(body, okFlag); },
});

/** Build a sandboxed service worker with stubbed caches + fetch. */
function makeSW({ network }) {
  const listeners = {};
  const store = new Map();
  const puts = [];

  const caches = {
    open: async () => ({ put: async (req, r) => { puts.push(key(req)); store.set(key(req), r); }, addAll: async () => {} }),
    match: async (req) => store.get(typeof req === 'string' ? req : key(req)) || undefined,
    keys: async () => [],
    delete: async () => true,
  };
  const key = r => (typeof r === 'string' ? r : r.url);

  const ctx = {
    self: {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      location: { origin: 'https://ivan7800.github.io' },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches,
    fetch: network,
    URL,
    Promise, setTimeout, clearTimeout, console,
  };
  ctx.self.caches = caches;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { listeners, store, puts, key };
}

const req = (url, { mode = 'no-cors', accept = '' } = {}) => ({
  url, method: 'GET', mode,
  headers: { get: h => (h.toLowerCase() === 'accept' ? accept : null) },
});

async function dispatch(sw, request) {
  let out;
  const ev = { request, respondWith: p => { out = p; } };
  sw.listeners.fetch(ev);
  return out ? await out : undefined;
}

console.log('\n══════════════════════════════════════════');
console.log('  sw.js — estrategia de caché');
console.log('══════════════════════════════════════════\n');

const DOC = 'https://ivan7800.github.io/aegis-404/index.html';
const ICON = 'https://ivan7800.github.io/aegis-404/icon-192.png';
const RELAY = 'https://mine.workers.dev/?url=https://example.com';

/* 1 — el documento va a la red primero */
{
  console.log('1 · Documento HTML: network-first');
  let hits = 0;
  const sw = makeSW({ network: async () => { hits++; return res('FRESCO'); } });
  sw.store.set(DOC, res('VIEJO'));

  const r = await dispatch(sw, req(DOC, { mode: 'navigate' }));
  if (hits === 1) ok('se consulta la red'); else no('se consulta la red', `hits=${hits}`);
  if (r.body === 'FRESCO') ok('se sirve la versión nueva, no la cacheada');
  else no('se sirve la versión nueva', `body=${r.body}`);
  if (sw.puts.includes(DOC)) ok('la respuesta nueva se guarda en caché');
  else no('la respuesta nueva se guarda en caché');
}

/* 2 — sin red, el documento cae a la caché */
{
  console.log('\n2 · Documento HTML sin red: cae a la caché');
  const sw = makeSW({ network: async () => { throw new Error('offline'); } });
  sw.store.set(DOC, res('CACHEADO'));

  const r = await dispatch(sw, req(DOC, { mode: 'navigate' }));
  if (r && r.body === 'CACHEADO') ok('sirve la copia cacheada (offline-first intacto)');
  else no('sirve la copia cacheada', `r=${r && r.body}`);
}

/* 3 — red lenta: no bloquea más de NAV_TIMEOUT */
{
  console.log('\n3 · Red lenta: no deja al usuario esperando');
  const sw = makeSW({ network: () => new Promise(r => setTimeout(() => r(res('TARDE')), 10000)) });
  sw.store.set(DOC, res('CACHEADO'));

  const t0 = Date.now();
  const r = await dispatch(sw, req(DOC, { mode: 'navigate' }));
  const dt = Date.now() - t0;

  if (dt < 4000) ok(`responde en ${dt} ms (timeout de 3 s)`); else no('respeta el timeout', `${dt} ms`);
  if (r && r.body === 'CACHEADO') ok('sirve la caché al agotarse el timeout');
  else no('sirve la caché al agotarse el timeout');
}

/* 4 — red devuelve 500: se ignora, se usa caché */
{
  console.log('\n4 · La red devuelve un error HTTP');
  const sw = makeSW({ network: async () => res('ERROR 500', false) });
  sw.store.set(DOC, res('CACHEADO'));
  const r = await dispatch(sw, req(DOC, { mode: 'navigate' }));
  if (r && r.body === 'CACHEADO') ok('un 500 no reemplaza la copia buena');
  else no('un 500 no reemplaza la copia buena', `body=${r && r.body}`);
}

/* 5 — assets: cache-first */
{
  console.log('\n5 · Assets estáticos: cache-first');
  let hits = 0;
  const sw = makeSW({ network: async () => { hits++; return res('DESDE RED'); } });
  sw.store.set(ICON, res('DESDE CACHE'));

  const r = await dispatch(sw, req(ICON));
  if (r.body === 'DESDE CACHE') ok('sirve el icono desde caché'); else no('sirve desde caché');
  if (hits === 0) ok('no toca la red'); else no('no toca la red', `hits=${hits}`);
}

/* 6 — cross-origin nunca se intercepta */
{
  console.log('\n6 · Peticiones cross-origin (relay, Observatory)');
  const sw = makeSW({ network: async () => res('X') });
  const r = await dispatch(sw, req(RELAY));
  if (r === undefined) ok('el SW no intercepta: pasan directas a la red');
  else no('el SW no intercepta', 'respondWith fue llamado');
}

/* 7 — detección por cabecera accept, no solo por mode */
{
  console.log('\n7 · Detección del documento por cabecera Accept');
  let hits = 0;
  const sw = makeSW({ network: async () => { hits++; return res('FRESCO'); } });
  sw.store.set(DOC, res('VIEJO'));
  const r = await dispatch(sw, req(DOC, { mode: 'cors', accept: 'text/html,application/xhtml+xml' }));
  if (hits === 1 && r.body === 'FRESCO') ok('accept: text/html también activa network-first');
  else no('accept: text/html activa network-first', `hits=${hits}`);
}

console.log(`\n══════════════════════════════════════════`);
console.log(`  ${pass} pasan   ${fail} fallan`);
console.log(`══════════════════════════════════════════\n`);
process.exit(fail ? 1 : 0);
