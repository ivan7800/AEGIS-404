import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name) => { console.log(`  ✅ ${name}`); pass++; };
const no = (name, detail) => { console.log(`  ❌ ${name}${detail ? '\n       → ' + detail : ''}`); fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- minimal localStorage shim (jsdom has one, but we want a fresh, inspectable one)
function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

async function boot({ fetchImpl, storage } = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://ivan7800.github.io/aegis-404/',
    pretendToBeVisual: true,
    beforeParse(w) {
      const store = storage || makeStorage();
      Object.defineProperty(w, 'localStorage', { value: store, configurable: true });
      // pre-accept the ethics gate so boot() runs the app directly
      store.setItem('aegis-ack', '1');
      w.fetch = fetchImpl || (() => Promise.reject(new Error('no network')));
      w.scrollTo = () => {};
      if (!w.crypto || !w.crypto.getRandomValues) {
        Object.defineProperty(w, 'crypto', {
          value: { getRandomValues: a => a, subtle: {} },
          configurable: true,
        });
      }
      try { w.navigator.serviceWorker = undefined; } catch {}
    },
  });
  await sleep(80); // let the inline script boot + go('dash') run
  return dom;
}

console.log('\n══════════════════════════════════════════════════');
console.log('  AEGIS 404 — verificación empírica (jsdom)');
console.log('══════════════════════════════════════════════════\n');

/* ──────────────────────────────────────────────────────────
   TEST 1 — the app boots at all
   ────────────────────────────────────────────────────────── */
console.log('TEST 1 · Arranque');
{
  const dom = await boot();
  const { document } = dom.window;
  const content = document.querySelector('#content');
  if (content && content.innerHTML.length > 500) ok('La app arranca y renderiza el dashboard');
  else no('La app arranca', `#content tiene ${content ? content.innerHTML.length : 'null'} chars`);

  if (document.querySelector('#gate').style.display === 'none' || document.querySelector('#gate').style.display === '')
    ok('La barrera ética se omite con aegis-ack=1');
  else no('Barrera ética omitida', `display=${document.querySelector('#gate').style.display}`);

  const title = document.title;
  if (/Inicio/.test(title)) ok(`document.title se actualiza al navegar ("${title}")`);
  else no('document.title se actualiza', `title="${title}"`);
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 2 — SCANNING flag released when ALL relays fail
   This is the bug the `finally` block was meant to fix.
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 2 · El escáner se recupera cuando la red falla por completo');
{
  // reject *slowly* so the in-flight "disabled" state is observable
  const slowFail = () => new Promise((_, rej) => setTimeout(() => rej(new Error('ECONNREFUSED')), 250));
  const dom = await boot({ fetchImpl: slowFail });
  const { document } = dom.window;

  // navigate to scan view
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);

  const btn = document.querySelector('#scanGo');
  const input = document.querySelector('#scanUrl');
  if (!btn || !input) { no('Vista de escáner presente'); }
  else {
    ok('Vista de escáner renderiza input + botón');
    input.value = 'example.com';
    btn.click();

    await sleep(60);
    if (btn.disabled) ok('El botón se deshabilita durante el escaneo');
    else no('El botón se deshabilita durante el escaneo');

    await sleep(1200); // let every relay time out

    if (!btn.disabled) ok('El botón SE REHABILITA tras el fallo total de red (bloque finally)');
    else no('El botón se rehabilita tras fallo total', 'sigue disabled → escáner bloqueado permanentemente');

    const out = document.querySelector('#scanOut').textContent;
    if (/No se pudo obtener la página/.test(out)) ok('Se muestra el mensaje de error accionable');
    else no('Mensaje de error accionable', out.slice(0, 120));

    // and crucially: a SECOND scan must actually start (flag released)
    document.querySelector('#scanOut').innerHTML = '';
    btn.click();
    await sleep(60);
    const restarted = btn.disabled || /scanprog/.test(document.querySelector('#scanOut').innerHTML);
    if (restarted) ok('Un segundo escaneo puede iniciarse (flag SCANNING liberado)');
    else no('Segundo escaneo posible', 'el click no hizo nada → flag SCANNING atascado');
    await sleep(1200);
  }
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 3 — SCANNING released even if render throws
   This is the path a plain try/catch would NOT have covered.
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 3 · El flag se libera aunque el renderizado lance una excepción');
{
  const goodHtml = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><p>hola</p></body></html>';
  const fetchImpl = (url) => {
    if (/observatory/.test(url)) return Promise.reject(new Error('CORS'));
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(goodHtml),
      json: () => Promise.resolve({ contents: goodHtml, status: { http_code: 200 } }),
      headers: { get: () => 'text/html' },
    });
  };
  const dom = await boot({ fetchImpl });
  const { document } = dom.window;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);

  const btn = document.querySelector('#scanGo');
  const input = document.querySelector('#scanUrl');
  input.value = 'example.com';

  // sabotage the render step by removing #scanOut mid-flight
  btn.click();
  await sleep(50);
  const out = document.querySelector('#scanOut');
  if (out) out.querySelector = () => { throw new Error('render sabotage'); };

  await sleep(900);
  if (!btn.disabled) ok('El botón se rehabilita aunque el render explote (finally, no catch)');
  else no('Botón rehabilitado tras excepción de render', 'sigue disabled');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 4 — successful scan produces findings + grade
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 4 · Escaneo exitoso sobre HTML vulnerable conocido');
{
  const vuln = `<!doctype html><html><head>
    <script src="http://cdn.evil.com/x.js"><\/script>
    <meta name="generator" content="WordPress 5.2">
    </head><body>
    <script>var key="sk-abcdefghij0123456789klmno";eval(location.hash);<\/script>
    <a href="#" target="_blank">link</a>
    <form action="http://x.com"><input type="password"></form>
    </body></html>`;
  const fetchImpl = (url) => {
    if (/observatory/.test(url)) return Promise.reject(new Error('CORS'));
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(vuln),
      json: () => Promise.resolve({ contents: vuln, status: { http_code: 200 } }),
      headers: { get: () => 'text/html' },
    });
  };
  const dom = await boot({ fetchImpl });
  const { document } = dom.window;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);
  document.querySelector('#scanUrl').value = 'https://vulnerable.test/';
  document.querySelector('#scanGo').click();
  await sleep(1200);

  const out = document.querySelector('#scanOut').textContent;
  const checks = [
    ['Detecta secreto sk- expuesto', /sk-|Clave secreta/i],
    ['Detecta eval()', /eval/i],
    ['Detecta target=_blank sin noopener', /noopener/i],
    ['Detecta WordPress', /WordPress/i],
    ['Detecta formulario/contraseña inseguro', /contraseña|HTTP/i],
  ];
  for (const [name, re] of checks) {
    if (re.test(out)) ok(name); else no(name);
  }

  const gradeEl = document.querySelector('#scanOut .ring .lbl b');
  const grade = gradeEl && gradeEl.textContent.trim();
  if (grade && /^[A-F][+]?$/.test(grade)) ok(`Muestra una nota A–F (nota: ${grade})`);
  else no('Muestra una nota A–F', `leído: "${grade}"`);

  const badge = document.querySelector('[data-badge="scan"]');
  if (badge && +badge.textContent > 0) ok(`El badge de navegación muestra ${badge.textContent} hallazgos`);
  else no('Badge de navegación actualizado');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 5 — OWASP checklist persistence (item 2)
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 5 · Persistencia del checklist OWASP');
{
  const storage = makeStorage();
  let dom = await boot({ storage });
  let { document } = dom.window;

  document.querySelector('[data-view="owasp"]').click();
  await sleep(40);

  const boxes = [...document.querySelectorAll('#owChk input[type=checkbox]')];
  if (boxes.length === 10) ok('Se renderizan las 10 categorías OWASP');
  else no('10 categorías OWASP', `encontradas ${boxes.length}`);

  // check A01 and A03
  boxes[0].checked = true; boxes[0].dispatchEvent(new dom.window.Event('change'));
  boxes[2].checked = true; boxes[2].dispatchEvent(new dom.window.Event('change'));
  await sleep(20);

  const saved = storage.getItem('aegis-owasp');
  if (saved && /A01/.test(saved) && /A03/.test(saved)) ok(`Estado guardado en localStorage: ${saved}`);
  else no('Estado guardado en localStorage', String(saved));

  // navigate away and back — the original bug
  document.querySelector('[data-view="report"]').click();
  await sleep(30);
  document.querySelector('[data-view="owasp"]').click();
  await sleep(40);

  const after = [...document.querySelectorAll('#owChk input[type=checkbox]')];
  if (after[0].checked && after[2].checked && !after[1].checked)
    ok('El checklist sobrevive a la navegación dentro de la sesión');
  else no('Checklist sobrevive a navegación', `A01=${after[0].checked} A02=${after[1].checked} A03=${after[2].checked}`);

  // labels are clickable
  const lbl = document.querySelector('#owChk label.txt');
  if (lbl && lbl.getAttribute('for') === 'ow0') ok('Las casillas tienen <label for> (clicables + accesibles)');
  else no('label[for] presente en el checklist');

  // full reload with the same storage — the real persistence test
  dom.window.close();
  dom = await boot({ storage });
  document = dom.window.document;
  document.querySelector('[data-view="owasp"]').click();
  await sleep(40);
  const reloaded = [...document.querySelectorAll('#owChk input[type=checkbox]')];
  if (reloaded[0].checked && reloaded[2].checked)
    ok('El checklist sobrevive a un RECARGADO COMPLETO de la página');
  else no('Checklist sobrevive a recarga completa');

  // reset button
  document.querySelector('#owReset').click();
  await sleep(20);
  if (!storage.getItem('aegis-owasp')) ok('El botón «Reiniciar checklist» limpia el estado');
  else no('Reiniciar checklist limpia el estado');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 6 — relay validation + persistence (item 1)
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 6 · Relay propio: validación y persistencia');
{
  const storage = makeStorage();
  let dom = await boot({ storage });
  let { document, window } = dom.window.document ? dom.window : {};
  document = dom.window.document;

  document.querySelector('[data-view="scan"]').click();
  await sleep(40);

  const input = document.querySelector('#scanProxy');
  const stat = document.querySelector('#relayStatus');
  if (input && stat) ok('El campo de relay y su estado existen'); else no('Campo de relay presente');

  const type = (v) => { input.value = v; input.dispatchEvent(new dom.window.Event('input')); };

  type('http://inseguro.dev/?url=');
  if (/https/.test(stat.textContent)) ok('Rechaza relays http:// (exige https)');
  else no('Rechaza http://', stat.textContent);

  type('no-es-una-url');
  if (/válida|valida/i.test(stat.textContent)) ok('Rechaza cadenas que no son URL');
  else no('Rechaza no-URL', stat.textContent);

  type('https://relay.workers.dev/foo');
  if (/terminar/i.test(stat.textContent)) ok('Rechaza relays que no terminan en "/" o "="');
  else no('Rechaza sufijo inválido', stat.textContent);

  type('https://mi-relay.ivan.workers.dev/?url=');
  if (storage.getItem('aegis-relay') === 'https://mi-relay.ivan.workers.dev/?url=')
    ok('Un relay válido se persiste en localStorage al teclearlo');
  else no('Relay válido persistido', String(storage.getItem('aegis-relay')));

  type('');
  if (!storage.getItem('aegis-relay')) ok('Vaciar el campo borra el relay guardado');
  else no('Vaciar el campo borra el relay');

  // restore across reload
  storage.setItem('aegis-relay', 'https://mi-relay.ivan.workers.dev/?url=');
  dom.window.close();
  dom = await boot({ storage });
  document = dom.window.document;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);
  if (document.querySelector('#scanProxy').value === 'https://mi-relay.ivan.workers.dev/?url=')
    ok('El relay guardado se restaura tras recargar');
  else no('Relay restaurado tras recarga');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 7 — custom relay is tried BEFORE the public pool
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 7 · El relay propio se usa antes que los públicos');
{
  const storage = makeStorage();
  storage.setItem('aegis-relay', 'https://mine.workers.dev/?url=');
  const calls = [];
  const goodHtml = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>ok</body></html>';
  const fetchImpl = (url) => {
    calls.push(url);
    if (/observatory/.test(url)) return Promise.reject(new Error('CORS'));
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(goodHtml),
      json: () => Promise.resolve({ contents: goodHtml }),
      headers: { get: () => 'text/html' },
    });
  };
  const dom = await boot({ storage, fetchImpl });
  const { document } = dom.window;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);
  document.querySelector('#scanUrl').value = 'example.com';
  document.querySelector('#scanGo').click();
  await sleep(900);

  const pageCalls = calls.filter(c => !/observatory/.test(c));
  if (pageCalls.length && /mine\.workers\.dev/.test(pageCalls[0]))
    ok('La primera petición va a tu relay, no a allorigins');
  else no('Tu relay va primero', `primera llamada: ${pageCalls[0]}`);

  const hitPublic = pageCalls.some(c => /allorigins|codetabs|corsproxy|thingproxy|cors\.eu/.test(c));
  if (!hitPublic) ok('Con tu relay funcionando, los públicos NO se llaman (0 peticiones desperdiciadas)');
  else no('Los públicos no se llaman', `${pageCalls.length} llamadas`);

  const src = document.querySelector('#scanOut').textContent;
  if (/tu relay/i.test(src)) ok('El panel de fuentes acredita «tu relay»');
  else no('Panel de fuentes acredita tu relay');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 8 — fallback to public pool when custom relay is down
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 8 · Fallback a relays públicos si el propio cae');
{
  const storage = makeStorage();
  storage.setItem('aegis-relay', 'https://broken.workers.dev/?url=');
  const calls = [];
  const goodHtml = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>ok</body></html>';
  const fetchImpl = (url) => {
    calls.push(url);
    if (/observatory/.test(url)) return Promise.reject(new Error('CORS'));
    if (/broken\.workers\.dev/.test(url)) return Promise.reject(new Error('502'));
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(goodHtml),
      json: () => Promise.resolve({ contents: goodHtml }),
      headers: { get: () => 'text/html' },
    });
  };
  const dom = await boot({ storage, fetchImpl });
  const { document } = dom.window;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);
  document.querySelector('#scanUrl').value = 'example.com';
  document.querySelector('#scanGo').click();
  await sleep(1000);

  const pageCalls = calls.filter(c => !/observatory/.test(c));
  const usedPublic = pageCalls.some(c => /allorigins|codetabs|corsproxy/.test(c));
  if (usedPublic) ok('Cae con elegancia a los relays públicos');
  else no('Fallback a públicos', pageCalls.join(', '));

  if (!document.querySelector('#scanGo').disabled) ok('El escaneo termina y el botón queda usable');
  else no('Escaneo termina limpiamente');

  const out = document.querySelector('#scanOut').textContent;
  if (!/No se pudo obtener/.test(out)) ok('El escaneo tiene éxito pese al fallo del relay propio');
  else no('Escaneo exitoso tras fallback');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 9 — CVSS state survives navigation (regression on _cvssState)
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 9 · El estado de CVSS sobrevive a la navegación');
{
  const dom = await boot();
  const { document } = dom.window;
  document.querySelector('[data-view="cvss"]').click();
  await sleep(40);

  // flip Attack Vector to "Físico" (last option)
  const avSeg = document.querySelector('.seg[data-m="AV"]');
  const physical = [...avSeg.querySelectorAll('button')].find(b => b.dataset.v === 'P');
  physical.click();
  await sleep(20);
  const vec1 = document.querySelector('#cvVec').textContent;
  if (/AV:P/.test(vec1)) ok(`El vector refleja el cambio (${vec1.slice(0, 30)}…)`);
  else no('Vector refleja el cambio', vec1);

  document.querySelector('[data-view="dash"]').click();
  await sleep(30);
  document.querySelector('[data-view="cvss"]').click();
  await sleep(40);
  const vec2 = document.querySelector('#cvVec').textContent;
  if (/AV:P/.test(vec2)) ok('AV:P sigue seleccionado al volver (sin window.__cvss)');
  else no('Estado CVSS persiste', vec2);

  // no global pollution
  if (typeof dom.window.__cvss === 'undefined') ok('window.__cvss ya no existe (sin polución global)');
  else no('window.__cvss eliminado');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 10 — Observatory data is escaped (XSS regression)
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 10 · Los datos de Observatory se escapan (regresión XSS)');
{
  const goodHtml = '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>ok</body></html>';
  const evil = '<img src=x onerror="window.__PWNED=1">';
  const fetchImpl = (url, opts) => {
    if (/observatory/.test(url)) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          grade: 'F', score: 0,
          tests: { 'evil-test': { pass: false, score_description: evil } },
        }),
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(goodHtml),
      json: () => Promise.resolve({ contents: goodHtml }),
      headers: { get: () => 'text/html' },
    });
  };
  const dom = await boot({ fetchImpl });
  const { document } = dom.window;
  document.querySelector('[data-view="scan"]').click();
  await sleep(40);
  document.querySelector('#scanUrl').value = 'example.com';
  document.querySelector('#scanGo').click();
  await sleep(1100);

  if (typeof dom.window.__PWNED === 'undefined') ok('El payload de Observatory NO ejecuta código');
  else no('XSS via Observatory', 'window.__PWNED fue asignado');

  const injected = document.querySelector('#scanOut img[onerror]');
  if (!injected) ok('No se inyecta ningún <img onerror> en el DOM');
  else no('Elemento malicioso inyectado en el DOM');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 11 — a11y structure
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 11 · Estructura de accesibilidad');
{
  const dom = await boot();
  const { document } = dom.window;

  const skip = document.querySelector('a.skip-link');
  if (skip && skip.getAttribute('href') === '#content') ok('Skip link presente y apunta a #content');
  else no('Skip link');

  if (document.querySelector('#content')) ok('El destino #content existe');
  else no('#content existe');

  if (document.querySelector('nav[aria-label]')) ok('El <nav> tiene aria-label');
  else no('<nav> con aria-label');

  const active = document.querySelector('#nav button.active');
  if (active && active.getAttribute('aria-current') === 'page') ok('El botón activo tiene aria-current="page"');
  else no('aria-current en el botón activo');

  document.querySelector('[data-view="csp"]').click();
  await sleep(40);
  const cspLbl = document.querySelector('#cBuild label.txt[for]');
  if (cspLbl) ok('El constructor CSP usa <label for> en sus casillas');
  else no('label[for] en constructor CSP');

  if (document.querySelector('noscript')) ok('Existe fallback <noscript>');
  else no('<noscript> presente');
  dom.window.close();
}

/* ──────────────────────────────────────────────────────────
   TEST 12 — ethics gate focus trap
   ────────────────────────────────────────────────────────── */
console.log('\nTEST 12 · Barrera ética: modal y foco');
{
  const storage = makeStorage(); // NO aegis-ack -> gate shows
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://ivan7800.github.io/aegis-404/',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: storage, configurable: true });
      w.fetch = () => Promise.reject(new Error('x'));
      w.scrollTo = () => {};
      w.navigator.serviceWorker = undefined;
    },
  });
  await sleep(120);
  const { document } = dom.window;
  const gate = document.querySelector('#gate');

  if (gate.style.display === 'flex') ok('La barrera se muestra sin consentimiento previo');
  else no('Barrera mostrada', gate.style.display);

  if (gate.getAttribute('role') === 'dialog' && gate.getAttribute('aria-modal') === 'true')
    ok('El modal declara role="dialog" y aria-modal="true"');
  else no('role/aria-modal en el modal');

  if (gate.getAttribute('aria-labelledby') === 'gateTitle' && document.querySelector('#gateTitle'))
    ok('aria-labelledby apunta a un título real');
  else no('aria-labelledby válido');

  const okBtn = document.querySelector('#gateOk');
  if (okBtn.disabled) ok('El botón de entrada arranca deshabilitado');
  else no('Botón deshabilitado al inicio');

  const ack = document.querySelector('#ackbox');
  ack.checked = true; ack.dispatchEvent(new dom.window.Event('change'));
  await sleep(20);
  if (!okBtn.disabled) ok('Marcar el consentimiento habilita el botón');
  else no('Consentimiento habilita el botón');

  okBtn.click();
  await sleep(60);
  if (gate.style.display === 'none') ok('Aceptar cierra la barrera');
  else no('Aceptar cierra la barrera');
  if (storage.getItem('aegis-ack') === '1') ok('El consentimiento se persiste');
  else no('Consentimiento persistido');
  if (document.querySelector('#content').innerHTML.length > 500) ok('La app arranca tras aceptar');
  else no('App arranca tras aceptar');
  dom.window.close();
}

console.log('\n══════════════════════════════════════════════════');
console.log(`  RESULTADO:  ${pass} pasan   ${fail} fallan`);
console.log('══════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
