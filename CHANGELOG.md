# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [2.1.2] — 2026-07-19
### Corregido
- **Escáner: fallo rápido cuando la página no se puede obtener.** Cuando todos los relays fallaban, la app aún consultaba Mozilla Observatory (hasta 15 s) y luego descartaba sus resultados en el retorno temprano de error. Ahora Observatory solo se consulta si hay HTML que analizar: el mensaje de error aparece hasta 15 s antes. El panel de fuentes lo indica («Omitido: no se obtuvo la página»).
- **Doble escapado en títulos de hallazgos.** `findingHTML` escapa el título una vez, pero Observatory, el analizador de JWT y el de cookies aplicaban `esc()` también al construirlo: una cookie llamada `a&b` se mostraba como `a&amp;b`. Eliminado el escape interno; el escape único de `findingHTML` se mantiene (verificado con test de regresión XSS: los nombres maliciosos siguen sin inyectarse).
- **«Escaneos recientes»: localStorage tratado como entrada no confiable.** La nota (`grade`), el color, el contador y la fecha guardados se interpolaban sin sanear en dos plantillas duplicadas (dashboard y vista de escáner). Una entrada manipulada podía inyectar marcado vía `grade`. Ahora ambas vistas usan un único renderizador compartido (`recentScansHTML`) que valida el color contra `#hex`, trunca la nota a 2 caracteres, fuerza entero en el contador y escapa la fecha. Cubierto por un test que siembra una entrada hostil y verifica que no ejecuta ni inyecta nada en ninguna de las dos vistas.
- **Service worker: un asset no cacheado sin red ya no recibe `index.html`.** El fallback de `cacheFirst` devolvía el documento HTML a cualquier petición fallida (un `<img>` recibía HTML como imagen). Ahora responde `504` limpio. Caché renombrada a `aegis404-v2.1.2`.

### Añadido
- 10 pruebas unitarias nuevas (7 en `qa/test-app.mjs`, incl. dashboard y vista de escáner por separado; 2 en `qa/test-sw.mjs`; harness del SW ampliado con `Response`). Total: 64 app + 13 SW + 24 escáner + 2 592 vectores CVSS + contraste.

## [2.1.1] — 2026-07-10
### Corregido
- **CVSS 3.1: redondeo conforme al spec.** `Math.ceil(base*10)/10` se sustituye por el `Roundup` del Apéndice A (aritmética entera). Una comparación exhaustiva contra una implementación de referencia —validada primero con 17 vectores de puntuación publicada— confirmó que **los 2 592 vectores posibles ya coincidían**, pero el método anterior funcionaba por suerte (`8.6*10 === 86.00000000000001`): habría fallado al añadir métricas temporales o ambientales.
- **Service worker: network-first para el HTML.** Antes `index.html` se servía siempre desde caché, de modo que al publicar una versión los usuarios veían la anterior hasta la segunda visita. Ahora el documento se pide a la red (timeout 3 s) con la caché como respaldo; los assets estáticos siguen cache-first y las peticiones cross-origin (relays, Observatory) no se interceptan. Verificado con 11 pruebas unitarias del SW.
- **Escáner: falso positivo en manejadores inline.** Atributos como `once=""` u `online-status=""` casaban con `/^on[a-z]+$/` y se contaban como handlers de eventos. Ahora solo cuentan los nombres `on*` que existen realmente como propiedad de un elemento DOM.

### Añadido
- **Suite de precisión del escáner** (`qa/test-scanner.mjs`): 24 comprobaciones sobre un corpus de páginas realistas — limpia, diccionario i18n, genuinamente vulnerable, trampas de falsos secretos (`sk-panel`, `@sk-toolkit`), JWT, conteo SRI y contenido mixto activo/pasivo.
- **Verificación exhaustiva de CVSS** (`qa/cvss.mjs`): la implementación de la app contra el spec en todas las combinaciones posibles.
- **Pruebas unitarias del service worker** (`qa/test-sw.mjs`): network-first, fallback offline, timeout, respuesta 500, cache-first de assets y no-intercepción cross-origin.
- Las cinco suites jsdom viven ahora en `qa/` y corren con `npm run test:unit`, también en CI antes de Playwright (no necesitan navegador).

## [2.1.0] — 2026-07-10
### Añadido
- **Relay propio como ciudadano de primera clase.** El relay CORS del usuario ahora se prueba **solo y primero**; los relays públicos quedan como red de seguridad. Con un relay propio configurado, no se hace ni una sola petición a los públicos.
- **Persistencia del relay** en `localStorage`, con **validación en vivo** (exige `https://`, URL bien formada y sufijo `/` o `=`) y un botón **«Probar»** que verifica contra `example.com` antes de confiar en él.
- **`relay/worker.js`**: Cloudflare Worker listo para desplegar, con restricción de origen, **protección anti-SSRF** (bloquea `localhost`, rangos privados y endpoints de metadatos de nube), límite de 5 MB y timeout de 15 s. Incluye `relay/README.md` y `relay/wrangler.toml`.
- **Persistencia del checklist OWASP**, indexada por código de categoría (`A01`…`A10`) y no por posición, de modo que reordenar el array nunca corrompe un checklist guardado. Con botón **«Reiniciar checklist»** y contador de cobertura en vivo.
- **Suite E2E con Playwright** (`tests/aegis.spec.js`): 20 pruebas en Chromium y Pixel 5 que cubren el fallo total de red, la precedencia del relay propio, la persistencia, la regresión de XSS vía Observatory, la barrera ética y el menú móvil.
- **Auditoría de accesibilidad con `axe-core`** integrada en la suite, ejecutada sobre las 11 vistas más la barrera ética.
- **CI en GitHub Actions** (`.github/workflows/qa.yml`) que ejecuta todo lo anterior en cada push.

### Corregido
- **Contraste WCAG 2.1 AA.** Una auditoría exhaustiva de los 28 pares color/fondo reales de la interfaz reveló 4 fallos que la comprobación manual anterior no vio, porque solo se había medido contra el fondo de página y no contra el de las tarjetas:
  - `--faint` `#697d96` → `#788aa1` (4,06:1 sobre `--surface` → **4,53:1** en el peor fondo)
  - `--muted` `#7789a1` → `#90a1b6` (para preservar los tres niveles de jerarquía tipográfica)
  - `--red` `#e5484d` → `#e64e53` (4,37:1 → **4,55:1** como texto sobre tarjetas)
- **El registro del service worker podía abortar el arranque de la app.** El guard `'serviceWorker' in navigator` es cierto incluso cuando el valor es `undefined` (`file://`, ciertos modos privados), y `.register` lanzaba. Ahora se comprueba el valor, no la clave, y `boot()` está blindado.
- El código del Worker que mostraba la interfaz era un **proxy abierto** (`Access-Control-Allow-Origin: *`, sin validación de destino). Sustituido por una versión con origen restringido y anti-SSRF.
- Las casillas del checklist OWASP y del constructor de CSP usaban `<div>` en lugar de `<label for>`: no eran clicables desde el texto ni se anunciaban correctamente.

## [2.0.1] — 2026-07-10
### Corregido
- **Fiabilidad del escáner de URL.** Los relays ahora se prueban **en paralelo** (gana el primero que devuelve HTML válido) en lugar de en secuencia, eliminando la espera acumulada por timeouts encadenados que hacía fallar el escaneo en sitios como los que solo respondían por un relay concreto.
- Lista de relays **ampliada y reordenada** (allorigins/raw, allorigins, codetabs, corsproxy.io, cors.eu.org, thingproxy) por fiabilidad.
### Añadido
- **Relay propio con Cloudflare Workers**: opción destacada en Opciones avanzadas con el código del Worker listo para copiar (gratis, 100k peticiones/día, sin rate-limit de terceros) — la solución definitiva cuando los relays públicos fallan.
- El mensaje de error de escaneo ahora ofrece dos salidas claras: pegar el HTML, o usar tu propio relay.

## [2.0.0] — 2026-07-10
### Añadido
- **Escáner de URL en vivo** — el módulo estrella. Introduces una dirección y AEGIS trae la página real y la audita en el navegador:
  - Obtención del HTML mediante una cadena de **4 relays CORS** con fallback y timeout; opción de **relay propio** y de **pegar el HTML manualmente** para sitios que bloquean relays.
  - Consulta *best-effort* a la **API de Mozilla HTTP Observatory** para una nota autoritativa de cabeceras (se degrada con elegancia si CORS lo impide).
  - **20+ comprobaciones** sobre el HTML real (parseado con `DOMParser`, sin ejecutar scripts): transporte HTTP, contenido mixto activo/pasivo, scripts y estilos de terceros sin **SRI**, **CSP** por meta, secretos expuestos (AWS, Google, `sk-`, tokens de GitHub, claves privadas, JWT), comentarios que filtran información, formularios inseguros y campos de contraseña por HTTP, `target="_blank"` sin `noopener`, iframes sin `sandbox`, fingerprinting de tecnología (WordPress, jQuery desactualizado, AngularJS), superficie de terceros e higiene.
  - **Nota global A–F** con anillo de puntuación, panel de **transparencia de fuentes**, metadatos del objetivo y hallazgos agrupados por categoría plegables.
  - **Escaneos recientes** persistidos localmente y reejecutables con un clic.
- **Informe premium en HTML** con nota, resumen por severidad, remediación y apéndice de metodología.
- Exportación a **CSV** (además de Markdown, JSON, HTML y PDF/impresión).
- Autorelleno del objetivo del informe con el último escaneo.

### Cambiado
- El panel de inicio ahora tiene como héroe el escáner de URL.
- Barrera ética actualizada: se explica con transparencia que el escaneo en vivo enruta la URL a través de un relay CORS público, mientras que el resto de módulos siguen siendo 100% locales.
- Service worker `v2.0.0`: ignora peticiones cross-origin para no cachear ni corromper las respuestas de los relays y de Observatory.

## [1.0.0] — 2026-07-10
### Añadido
- **Cabeceras HTTP**: análisis de 8 cabeceras de seguridad + detección de divulgación de tecnología, con nota A–F ponderada.
- **CSP**: analizador de políticas (unsafe-inline/eval, comodines, directivas ausentes) y constructor de política endurecida.
- **Escáner de código (SAST ligero)**: 16 reglas heurísticas (XSS por DOM, eval, secretos, enlaces HTTP, postMessage, localStorage sensible…) con número de línea.
- **Analizador de JWT**: decodificación local de header/payload y detección de `alg:none`, ausencia de `exp`, claims sensibles.
- **Analizador de cookies**: verificación de `Secure`, `HttpOnly`, `SameSite` y prefijos `__Host-/__Secure-`.
- **OWASP Top 10 (2021)**: referencia + checklist de auto-evaluación que genera hallazgos.
- **Calculadora CVSS v3.1**: Base Score verificado contra vectores oficiales, con vector exportable.
- **Utilidades**: codificación/decodificación (Base64, URL, Hex, entidades HTML), hashes SHA-1/256/384/512 vía WebCrypto, generador de nonce, analizador de entropía de contraseñas.
- **Informe consolidado**: agrega hallazgos de todos los módulos y exporta a Markdown, JSON, HTML autónomo e impresión/PDF.
- **PWA**: instalable y funcional offline (service worker + manifest).
- **Barrera de uso ético** y procesamiento 100% local (sin red, sin telemetría).
