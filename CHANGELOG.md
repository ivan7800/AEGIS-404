# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/).

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
