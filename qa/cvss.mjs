import fs from 'fs';

/* ── extract the app's real implementation ── */
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

const mBlock = /const CVSS_M = \{[\s\S]*?\n\};/.exec(js)[0];
const rBlock = /function roundup\(x\)\{[\s\S]*?\n\}/.exec(js)[0];
const fBlock = /function cvssScore\(s\)\{[\s\S]*?\n\}/.exec(js)[0];
const appSrc = `${mBlock}\n${rBlock}\n${fBlock}\nconst var_ = () => '#000';\nreturn cvssScore;`;
const appScore = new Function(appSrc)();

/* ── reference implementation, straight from CVSS v3.1 §7.1 + Appendix A ── */

// Appendix A: the ONLY correct Roundup. Works on integers to dodge float error.
function roundup(x) {
  const i = Math.round(x * 100000);
  if (i % 10000 === 0) return i / 100000;
  return (Math.floor(i / 10000) + 1) / 10;
}

const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.5 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
};

function refScore(s) {
  const iss = 1 - (1 - W.CIA[s.C]) * (1 - W.CIA[s.I]) * (1 - W.CIA[s.A]);
  const impact = s.S === 'U'
    ? 6.42 * iss
    : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const pr = (s.S === 'C' ? W.PR_C : W.PR_U)[s.PR];
  const expl = 8.22 * W.AV[s.AV] * W.AC[s.AC] * pr * W.UI[s.UI];
  if (impact <= 0) return 0;
  return s.S === 'U'
    ? roundup(Math.min(impact + expl, 10))
    : roundup(Math.min(1.08 * (impact + expl), 10));
}

/* ── sanity-check the REFERENCE against vectors with published scores ── */
const KNOWN = [
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
  ['AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
  ['AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],  // XSS reflejado clásico
  ['AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8],
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 7.5],
  ['AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N', 5.9],
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', 5.3],
  ['AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N', 4.3],
  ['AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H', 5.5],  // DoS local con privilegios bajos
  ['AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 6.2],
  ['AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 4.6],
  ['AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H', 6.7],
  ['AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H', 6.5],
  ['AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 6.5],
  ['AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H', 9.1],
  ['AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H', 9.9],
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0.0],
];
const parse = v => Object.fromEntries(v.split('/').map(p => p.split(':')));

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Paso 1 — validar la IMPLEMENTACIÓN DE REFERENCIA');
console.log('  contra vectores con puntuación publicada');
console.log('═══════════════════════════════════════════════════════\n');
let refBad = 0;
for (const [vec, expected] of KNOWN) {
  const got = refScore(parse(vec));
  const okk = Math.abs(got - expected) < 1e-9;
  if (!okk) refBad++;
  console.log(`  ${okk ? '✅' : '❌'} ${vec}  esperado ${expected.toFixed(1)}  obtenido ${got.toFixed(1)}`);
}
if (refBad) {
  console.log(`\n  ⚠️  La referencia falla ${refBad} vector(es). No sirve para juzgar la app.\n`);
  process.exit(2);
}
console.log('\n  ✅ La referencia reproduce los 17 vectores. Es fiable.\n');

/* ── exhaustive diff: app vs reference over every possible vector ── */
console.log('═══════════════════════════════════════════════════════');
console.log('  Paso 2 — la app contra la referencia, TODOS los vectores');
console.log('═══════════════════════════════════════════════════════\n');

const AXES = {
  AV: ['N', 'A', 'L', 'P'], AC: ['L', 'H'], PR: ['N', 'L', 'H'], UI: ['N', 'R'],
  S: ['U', 'C'], C: ['H', 'L', 'N'], I: ['H', 'L', 'N'], A: ['H', 'L', 'N'],
};
const keys = Object.keys(AXES);
const diffs = [];
let total = 0;

(function walk(i, acc) {
  if (i === keys.length) {
    total++;
    const app = appScore({ ...acc }).base;
    const ref = refScore(acc);
    if (Math.abs(app - ref) > 1e-9) {
      diffs.push({ vec: keys.map(k => `${k}:${acc[k]}`).join('/'), app, ref, d: +(app - ref).toFixed(4) });
    }
    return;
  }
  for (const v of AXES[keys[i]]) walk(i + 1, { ...acc, [keys[i]]: v });
})(0, {});

console.log(`  Vectores evaluados: ${total}`);
console.log(`  Discrepancias:      ${diffs.length}\n`);

if (diffs.length) {
  const inflated = diffs.filter(d => d.d > 0);
  const deflated = diffs.filter(d => d.d < 0);
  console.log(`  La app INFLA la puntuación en ${inflated.length} vectores`);
  console.log(`  La app REBAJA la puntuación en ${deflated.length} vectores\n`);

  // does any discrepancy change the severity rating?
  const band = s => (s >= 9 ? 'Crítico' : s >= 7 ? 'Alto' : s >= 4 ? 'Medio' : s > 0 ? 'Bajo' : 'Ninguno');
  const bandChanges = diffs.filter(d => band(d.app) !== band(d.ref));
  console.log(`  ⚠️  Cambian de categoría de severidad: ${bandChanges.length}\n`);

  console.log('  Primeras 12 discrepancias:');
  for (const d of diffs.slice(0, 12)) {
    const bc = band(d.app) !== band(d.ref) ? `  ⚠️ ${band(d.ref)}→${band(d.app)}` : '';
    console.log(`    ${d.vec}`);
    console.log(`       app ${d.app.toFixed(1)}   spec ${d.ref.toFixed(1)}   Δ${d.d > 0 ? '+' : ''}${d.d}${bc}`);
  }
  if (bandChanges.length) {
    console.log('\n  Vectores donde la severidad mostrada es INCORRECTA:');
    for (const d of bandChanges.slice(0, 8)) {
      console.log(`    ${d.vec}  →  la app dice "${band(d.app)}", el spec dice "${band(d.ref)}"`);
    }
  }
  console.log('');
  process.exit(1);
} else {
  console.log(`  ✅ La app coincide con el spec en los ${total} vectores.\n`);
}
