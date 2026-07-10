import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* ---------- WCAG 2.1 math (identical to what axe-core uses) ---------- */
function parseColor(str, vars) {
  if (!str) return null;
  str = str.trim();
  const v = /^var\(\s*(--[\w-]+)/.exec(str);
  if (v) return parseColor(vars[v[1]], vars);
  if (str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
  let m = /^#([0-9a-f]{3})$/i.exec(str);
  if (m) return m[1].split('').map(c => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})$/i.exec(str);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)/i.exec(str);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(n => !isNaN(n))) return p.slice(0, 3);
  }
  return null;
}
const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/* alpha-composite a translucent fg over an opaque bg */
function flatten(str, bg, vars) {
  const m = /^rgba\(([^)]+)\)/i.exec((str || '').trim());
  if (!m) return parseColor(str, vars);
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (p.length < 4) return parseColor(str, vars);
  const [r, g, b, a] = p;
  return [0, 1, 2].map(i => Math.round([r, g, b][i] * a + bg[i] * (1 - a)));
}

/* ---------- extract :root custom properties ---------- */
/* Only the FIRST <style> block is the app's. A second <style> lives inside the
   report-export template string and must not be applied to the live document. */
const cssBlocks = (/<style>([\s\S]*?)<\/style>/.exec(html) || ['', ''])[1];
const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(cssBlocks);
const vars = {};
if (rootBlock) {
  for (const m of rootBlock[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1].trim()] = m[2].trim();
}

/* ---------- boot the app and walk the rendered DOM ---------- */
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://ivan7800.github.io/aegis-404/',
  pretendToBeVisual: true,
  beforeParse(w) {
    const m = new Map([['aegis-ack', '1']]);
    Object.defineProperty(w, 'localStorage', {
      value: { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) },
      configurable: true,
    });
    w.fetch = () => Promise.reject(new Error('offline'));
    w.scrollTo = () => {};
    Object.defineProperty(w, 'crypto', { value: { getRandomValues: a => a, subtle: {} }, configurable: true });
  },
});
await new Promise(r => setTimeout(r, 120));
const { document, getComputedStyle } = dom.window;

const PAGE_BG = parseColor(vars['--ink'], vars) || [10, 14, 20];

function alphaOf(str) {
  const m = /^rgba\(([^)]+)\)/i.exec((str || '').trim());
  if (!m) return 1;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return p.length >= 4 ? p[3] : 1;
}
/* ── jsdom's cssstyle silently drops `background:` shorthands and any
   gradient containing var(). So we replay the stylesheet ourselves into a
   WeakMap and never ask jsdom about backgrounds at all. ── */
const BG = new WeakMap(); // el -> { stops: [[rgb,alpha]] , color: [rgb,alpha] | null }

function resolveVars(str) {
  let out = str, guard = 0;
  while (/var\(/.test(out) && guard++ < 10) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => vars[name] || 'transparent');
  }
  return out;
}
function colorTokens(value) {
  const out = [];
  for (const m of value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    const c = parseColor(m[0], vars);
    if (!c) continue;
    const a = alphaOf(m[0]);
    if (a <= 0.001) continue;
    out.push([c, a]);
  }
  return out;
}

function replayStylesheet() {
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m, rules = 0;
  while ((m = ruleRe.exec(cssBlocks))) {
    const selectors = m[1].trim();
    const decls = m[2];
    if (selectors.startsWith('@') || /^:root/.test(selectors)) continue;

    const shorthand = /(?:^|;)\s*background\s*:\s*([^;]+)/.exec(decls);
    const bgColor = /(?:^|;)\s*background-color\s*:\s*([^;]+)/.exec(decls);
    const bgImage = /(?:^|;)\s*background-image\s*:\s*([^;]+)/.exec(decls);
    if (!shorthand && !bgColor && !bgImage) continue;

    for (const sel of selectors.split(',')) {
      const clean = sel.trim();
      if (!clean || /::|:hover|:focus|:active|:checked|\[open\]/.test(clean)) continue;
      let nodes;
      try { nodes = document.querySelectorAll(clean); } catch { continue; }
      for (const el of nodes) {
        const rec = BG.get(el) || { stops: [], color: null };
        if (shorthand) {
          const v = resolveVars(shorthand[1]);
          if (/gradient\(/i.test(v)) rec.stops = colorTokens(v);
          else { const t = colorTokens(v); rec.color = t[0] || null; rec.stops = []; }
        }
        if (bgColor) { const t = colorTokens(resolveVars(bgColor[1])); rec.color = t[0] || null; }
        if (bgImage) {
          const v = resolveVars(bgImage[1]);
          rec.stops = /gradient\(/i.test(v) ? colorTokens(v) : [];
        }
        BG.set(el, rec);
        rules++;
      }
    }
  }
  return rules;
}

const composite = (fg, a, bg) => [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a)));

/* Opaque colour from the background-COLOR chain alone. */
function opaqueBase(el) {
  const layers = [];
  let n = el;
  while (n && n.nodeType === 1) {
    const rec = BG.get(n);
    if (rec && rec.color) {
      layers.push(rec.color);
      if (rec.color[1] >= 1) break;
    }
    n = n.parentElement;
  }
  let base = PAGE_BG;
  for (let i = layers.length - 1; i >= 0; i--) {
    const [c, a] = layers[i];
    base = a >= 1 ? c : composite(c, a, base);
  }
  return base;
}

/* Candidate backgrounds the text sits on; a gradient yields one per stop. */
function resolveBgs(el) {
  let n = el;
  while (n && n.nodeType === 1) {
    const rec = BG.get(n);
    if (rec) {
      if (rec.stops.length) {
        const under = rec.color ? (rec.color[1] >= 1 ? rec.color[0] : composite(rec.color[0], rec.color[1], opaqueBase(n.parentElement || el))) : opaqueBase(n.parentElement || el);
        const cands = rec.stops.map(([c, a]) => (a >= 1 ? c : composite(c, a, under)));
        if (!rec.stops.every(([, a]) => a >= 1)) cands.push(under);
        return cands;
      }
      if (rec.color && rec.color[1] >= 1) return [rec.color[0]];
    }
    n = n.parentElement;
  }
  return [opaqueBase(el)];
}

const VIEWS = ['dash', 'scan', 'headers', 'csp', 'code', 'jwt', 'cookies', 'owasp', 'cvss', 'utils', 'report'];
const results = new Map(); // dedupe by fg|bg|size

function auditCurrentDOM(viewName) {
  replayStylesheet();
  const els = document.querySelectorAll('#content *, .sidebar *, .footer *, .topbar *, #gate *');
  for (const el of els) {
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!text) continue; // only elements with their own text
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    const bgs = resolveBgs(el);
    const fgRaw = cs.color;

    const px = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight) || 400;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;

    // a gradient must be legible against its WORST stop
    let bg = bgs[0], fg = null, r = Infinity;
    for (const cand of bgs) {
      const f = flatten(fgRaw, cand, vars) || parseColor(fgRaw, vars);
      if (!f) continue;
      const rr = ratio(f, cand);
      if (rr < r) { r = rr; bg = cand; fg = f; }
    }
    if (!fg) continue;

    const hex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
    const key = `${hex(fg)}|${hex(bg)}|${large}`;
    if (results.has(key)) { results.get(key).views.add(viewName); continue; }
    results.set(key, {
      fg: hex(fg), bg: hex(bg), ratio: r, need, large, px, weight,
      sel: el.className ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}` : el.tagName.toLowerCase(),
      sample: text.slice(0, 34),
      views: new Set([viewName]),
    });
  }
}

for (const v of VIEWS) {
  const btn = document.querySelector(`[data-view="${v}"]`);
  if (btn) { btn.click(); await new Promise(r => setTimeout(r, 30)); }
  auditCurrentDOM(v);
}

/* also audit the ethics gate */
document.querySelector('#gate').style.display = 'flex';
auditCurrentDOM('gate');

const all = [...results.values()].sort((a, b) => a.ratio - b.ratio);
const fails = all.filter(x => x.ratio < x.need);
const passes = all.filter(x => x.ratio >= x.need);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  AEGIS 404 — Auditoría de contraste WCAG 2.1 AA');
console.log('══════════════════════════════════════════════════════════════\n');
console.log(`Pares color/fondo únicos evaluados: ${all.length}`);
console.log('(hoja de estilos reproducida a mano: jsdom no expande `background:` ni var() en gradientes)');
console.log(`Vistas recorridas: ${VIEWS.length + 1}\n`);

if (fails.length) {
  console.log(`❌ FALLAN AA (${fails.length}):\n`);
  for (const f of fails) {
    console.log(`  ${f.ratio.toFixed(2)}:1  (necesita ${f.need}:1)`);
    console.log(`     fg ${f.fg}  sobre  bg ${f.bg}   ${f.px}px/${f.weight}${f.large ? ' [texto grande]' : ''}`);
    console.log(`     ${f.sel} · "${f.sample}"`);
    console.log(`     vistas: ${[...f.views].join(', ')}\n`);
  }
} else {
  console.log('✅ Ningún par de texto falla WCAG AA.\n');
}

console.log(`✅ Pasan AA: ${passes.length}`);
const aaa = passes.filter(x => x.ratio >= (x.large ? 4.5 : 7));
console.log(`✨ Además pasan AAA: ${aaa.length}\n`);

console.log('Los 8 pares con menos margen (aunque pasen):');
for (const p of passes.slice(0, 8)) {
  console.log(`  ${p.ratio.toFixed(2)}:1  ${p.fg} / ${p.bg}  ${p.sel.padEnd(22)} "${p.sample.slice(0, 24)}"`);
}
console.log('');
dom.window.close();
process.exit(fails.length ? 1 : 0);
