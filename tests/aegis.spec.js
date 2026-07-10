// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/* Acepta la barrera ética antes de cada test. */
async function enter(page) {
  await page.addInitScript(() => localStorage.setItem('aegis-ack', '1'));
  await page.goto('/index.html');
  await expect(page.locator('#content')).not.toBeEmpty();
}

/* Intercepta todas las llamadas a relays y devuelve el HTML indicado. */
async function stubRelays(page, { html = null, fail = false, delay = 0 } = {}) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const isRelay = /allorigins|codetabs|corsproxy|thingproxy|cors\.eu|workers\.dev/.test(url);
    const isObs = /observatory/.test(url);
    if (isObs) return route.abort('failed');
    if (!isRelay) return route.continue();
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (fail) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'text/plain', body: html });
  });
}

const VULN = `<!doctype html><html><head>
  <script src="http://cdn.evil.com/a.js"></script>
  <meta name="generator" content="WordPress 5.2">
</head><body>
  <script>var k="sk-abcdefghij0123456789klmno"; eval(location.hash);</script>
  <a href="#" target="_blank">x</a>
  <form action="http://x.test"><input type="password"></form>
</body></html>`;

/* ───────────────────────── Escáner ───────────────────────── */

test('el botón se rehabilita cuando todos los relays fallan', async ({ page }) => {
  await enter(page);
  await stubRelays(page, { fail: true, delay: 300 });

  await page.click('[data-view="scan"]');
  await page.fill('#scanUrl', 'example.com');

  const btn = page.locator('#scanGo');
  await btn.click();
  await expect(btn).toBeDisabled();

  await expect(page.locator('#scanOut')).toContainText('No se pudo obtener la página', { timeout: 30000 });
  await expect(btn).toBeEnabled();

  // y un segundo escaneo debe poder arrancar
  await btn.click();
  await expect(btn).toBeDisabled();
});

test('un escaneo exitoso produce nota y hallazgos', async ({ page }) => {
  await enter(page);
  await stubRelays(page, { html: VULN });

  await page.click('[data-view="scan"]');
  await page.fill('#scanUrl', 'https://vulnerable.test/');
  await page.click('#scanGo');

  const grade = page.locator('#scanOut .ring .lbl b');
  await expect(grade).toHaveText(/^[A-F]\+?$/, { timeout: 30000 });

  const out = page.locator('#scanOut');
  await expect(out).toContainText(/sk-|Clave secreta/i);
  await expect(out).toContainText(/eval/i);
  await expect(out).toContainText(/WordPress/i);
  await expect(page.locator('[data-badge="scan"]')).not.toHaveClass(/zero/);
});

test('el relay propio se usa antes que los públicos', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aegis-ack', '1');
    localStorage.setItem('aegis-relay', 'https://mine.workers.dev/?url=');
  });

  const hits = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/observatory/.test(url)) return route.abort('failed');
    if (/workers\.dev|allorigins|codetabs|corsproxy/.test(url)) {
      hits.push(url);
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>ok</body></html>' });
    }
    return route.continue();
  });

  await page.goto('/index.html');
  await page.click('[data-view="scan"]');
  await expect(page.locator('#scanProxy')).toHaveValue('https://mine.workers.dev/?url=');

  await page.fill('#scanUrl', 'example.com');
  await page.click('#scanGo');
  await expect(page.locator('#scanOut .ring')).toBeVisible({ timeout: 30000 });

  expect(hits[0]).toContain('mine.workers.dev');
  expect(hits.some((h) => /allorigins|codetabs|corsproxy/.test(h))).toBe(false);
});

test('rechaza relays inválidos y persiste los válidos', async ({ page }) => {
  await enter(page);
  await page.click('[data-view="scan"]');

  const input = page.locator('#scanProxy');
  const stat = page.locator('#relayStatus');

  await input.fill('http://inseguro.dev/?url=');
  await expect(stat).toContainText('https');

  await input.fill('no-es-url');
  await expect(stat).toContainText(/válida/i);

  await input.fill('https://ok.workers.dev/?url=');
  await expect(stat).toContainText('Guardado');
  expect(await page.evaluate(() => localStorage.getItem('aegis-relay')))
    .toBe('https://ok.workers.dev/?url=');
});

/* ───────────────────────── OWASP ───────────────────────── */

test('el checklist OWASP sobrevive a recargar la página', async ({ page }) => {
  await enter(page);
  await page.click('[data-view="owasp"]');

  await page.locator('#ow0').check();
  await page.locator('#ow2').check();

  await page.reload();
  await page.click('[data-view="owasp"]');

  await expect(page.locator('#ow0')).toBeChecked();
  await expect(page.locator('#ow1')).not.toBeChecked();
  await expect(page.locator('#ow2')).toBeChecked();

  await page.click('#owReset');
  await expect(page.locator('#ow0')).not.toBeChecked();
});

/* ───────────────────────── CVSS ───────────────────────── */

test('el estado de CVSS persiste al navegar', async ({ page }) => {
  await enter(page);
  await page.click('[data-view="cvss"]');
  await page.click('.seg[data-m="AV"] button[data-v="P"]');
  await expect(page.locator('#cvVec')).toContainText('AV:P');

  await page.click('[data-view="dash"]');
  await page.click('[data-view="cvss"]');
  await expect(page.locator('#cvVec')).toContainText('AV:P');
});

/* ───────────────────────── Seguridad ───────────────────────── */

test('los datos de Observatory no ejecutan código', async ({ page }) => {
  await enter(page);
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/observatory/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          grade: 'F',
          tests: { evil: { pass: false, score_description: '<img src=x onerror="window.__PWNED=1">' } },
        }),
      });
    }
    if (/allorigins|codetabs|corsproxy|thingproxy|cors\.eu/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>ok</body></html>' });
    }
    return route.continue();
  });

  await page.click('[data-view="scan"]');
  await page.fill('#scanUrl', 'example.com');
  await page.click('#scanGo');
  await expect(page.locator('#scanOut .ring')).toBeVisible({ timeout: 30000 });

  expect(await page.evaluate(() => window.__PWNED)).toBeUndefined();
  await expect(page.locator('#scanOut img[onerror]')).toHaveCount(0);
});

/* ───────────────────────── Barrera ética ───────────────────────── */

test('la barrera ética atrapa el foco y bloquea hasta consentir', async ({ page }) => {
  await page.goto('/index.html');
  const gate = page.locator('#gate');
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#gateOk')).toBeDisabled();

  // Tab no debe escapar del modal
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('#gate'));
  expect(inside).toBe(true);

  await page.locator('#ackbox').check();
  await expect(page.locator('#gateOk')).toBeEnabled();
  await page.click('#gateOk');
  await expect(gate).toBeHidden();
});

/* ───────────────────────── Accesibilidad (axe real) ───────────────────────── */

const VIEWS = ['dash', 'scan', 'headers', 'csp', 'code', 'jwt', 'cookies', 'owasp', 'cvss', 'utils', 'report'];

for (const view of VIEWS) {
  test(`axe: sin violaciones WCAG 2.1 AA en la vista "${view}"`, async ({ page }) => {
    await enter(page);
    await page.click(`[data-view="${view}"]`);
    await page.waitForTimeout(150);

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (violations.length) {
      console.log(`\n[${view}] ${violations.length} violación(es):`);
      for (const v of violations) {
        console.log(`  ${v.id} (${v.impact}) — ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`     ${n.target.join(' ')}`);
      }
    }
    expect(violations).toEqual([]);
  });
}

test('axe: la barrera ética es accesible', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#gate')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
});

/* ───────────────────────── Móvil ───────────────────────── */

test('el menú lateral se abre y cierra en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);

  const sidebar = page.locator('#sidebar');
  await expect(page.locator('#ham')).toBeVisible();
  await expect(sidebar).not.toHaveClass(/open/);

  await page.click('#ham');
  await expect(sidebar).toHaveClass(/open/);

  await page.click('#navscrim');
  await expect(sidebar).not.toHaveClass(/open/);
});
