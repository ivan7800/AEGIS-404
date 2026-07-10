# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [2.0.2] — 2026-07-10
### Añadido
- **Instalación PWA en iOS**: metadatos `apple-mobile-web-app-*` y `apple-touch-icon` para que la app se instale y se muestre correctamente al añadirla a la pantalla de inicio en Safari/iOS.
### Corregido
- **Accesibilidad de la barrera ética**: el modal declara `role="dialog"`, `aria-modal` y `aria-labelledby`, y el icono se marca como decorativo para lectores de pantalla.
- **Ruido en el analizador de JWT**: la ausencia del claim opcional `iat` pasa de severidad *baja* a *informativa*, evitando penalizar tokens correctos.
- Coherencia de versión en interfaz, service worker, manifiesto y README.

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
