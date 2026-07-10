<div align="center">

# 🛡️ AEGIS 404

### Suite de Análisis de Seguridad Web

**La herramienta definitiva para auditar páginas web — desde una URL, en tu navegador.**

[![PWA](https://img.shields.io/badge/PWA-instalable-e8a13a)](#)
[![Sin dependencias](https://img.shields.io/badge/dependencias-0-49d6c8)](#)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-3fbf7a)](LICENSE)
[![Universo 404](https://img.shields.io/badge/Universo-404-c9d6e6)](#)
[![Versión](https://img.shields.io/badge/versión-2.0.2-5b8def)](CHANGELOG.md)

</div>

---

## ¿Qué es?

**AEGIS 404** es una suite de análisis de seguridad para **pentesting ético y auto-auditoría**. En la v2.0 su función estrella es el **Escáner de URL en vivo**: escribes una dirección y AEGIS trae la página real y la examina, generando hallazgos accionables por severidad, con nota A–F e informe exportable.

> ⚙️ **Cómo funciona el escaneo (honestidad técnica).** Una app estática no puede leer directamente webs de terceros por la política *same-origin*/CORS del navegador. AEGIS lo resuelve trayendo el HTML a través de un **relay CORS público** y analizándolo **localmente** con `DOMParser` (sin ejecutar scripts). Esto implica que la URL objetivo pasa por ese relay; y que las cabeceras servidas solo por HTTP pueden no ser visibles por esa vía (para un análisis autoritativo de cabeceras usa el módulo **Cabeceras** con el bookmarklet, o la nota de Mozilla Observatory que AEGIS consulta automáticamente). Si un sitio bloquea los relays, puedes **pegar el HTML** o indicar tu **propio relay**.

## Módulos

| Módulo | Qué hace |
|---|---|
| **◎ Escáner de URL** | **Escaneo en vivo desde una dirección.** Cadena de 4 relays CORS con fallback, consulta a Mozilla Observatory, y 20+ comprobaciones sobre el HTML real: contenido mixto, SRI, secretos, formularios, CSP por meta, tecnología, terceros… Nota A–F, categorías plegables y escaneos recientes. |
| **⛨ Cabeceras HTTP** | Evalúa CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP y detecta divulgación de tecnología. Nota **A–F** ponderada. |
| **⧉ CSP** | Audita políticas (`unsafe-inline`/`unsafe-eval`, comodines, directivas ausentes) y **construye** una política endurecida. |
| **⟨⟩ Escáner de código** | SAST ligero: 16 reglas para XSS por DOM, `eval`, secretos embebidos, enlaces HTTP, `postMessage`, `localStorage` sensible… con nº de línea. |
| **⬡ JWT** | Decodifica header/payload y detecta `alg:none`, ausencia de `exp`, claims sensibles. **No** envía el token a ningún sitio. |
| **◫ Cookies** | Verifica `Secure`, `HttpOnly`, `SameSite` y prefijos `__Host-`/`__Secure-`. |
| **☰ OWASP Top 10** | Referencia 2021 + checklist de cobertura que genera hallazgos. |
| **▤ CVSS v3.1** | Calculadora de severidad con Base Score **verificado contra vectores oficiales** y vector exportable. |
| **⚙ Utilidades** | Base64/URL/Hex/entidades HTML, hashes SHA-1/256/384/512 (WebCrypto), generador de nonce, analizador de entropía de contraseñas. |
| **▦ Informe** | Consolida todos los hallazgos y exporta a **HTML premium · Markdown · JSON · CSV · PDF (imprimir)**. |

## Qué detecta el escáner en vivo

- **Transporte** — páginas servidas por HTTP sin cifrar.
- **Contenido mixto** activo (scripts/estilos/marcos por HTTP) y pasivo (imágenes/medios).
- **Integridad (SRI)** — scripts y estilos de terceros sin `integrity`.
- **Secretos** — claves AWS, API keys de Google, `sk-…`, tokens de GitHub, claves privadas y JWT en el HTML.
- **Formularios** — envío por HTTP, campos de contraseña sin HTTPS, `action` cross-origin.
- **XSS/CSP** — scripts y manejadores inline, `target="_blank"` sin `noopener`, iframes sin `sandbox`, ausencia de CSP, y el motor SAST sobre el JS inline.
- **Tecnología y terceros** — WordPress, jQuery desactualizado, AngularJS, `meta generator`, y superficie de dominios externos.
- **Higiene** — `lang`, charset, referrer permisiva, comentarios que filtran información.

## Características

- **Cero dependencias.** Un único `index.html` con HTML, CSS y JS vanilla.
- **Offline / PWA.** Instalable y funcional sin conexión (los módulos manuales operan sin red; el escáner en vivo necesita conexión para el relay).
- **Privado por diseño.** Los módulos manuales no envían nada. El escáner en vivo solo enruta la URL objetivo por un relay CORS público; AEGIS no tiene servidor ni telemetría propios.
- **Responsive.** Diseñado móvil-primero, con foco de teclado visible y `prefers-reduced-motion`.

## Uso

1. Abre `index.html` (o la URL de GitHub Pages) y acepta la barrera de uso ético.
2. En **Inicio** o en **Escáner de URL**, escribe una dirección y pulsa **Escanear**.
3. Revisa la nota A–F y los hallazgos por categoría.
4. Ve a **Informe** y exporta en HTML, Markdown, JSON, CSV o PDF.

Para sitios que bloquean relays, abre **Opciones avanzadas** y pega el HTML de la página (Ctrl+U → copiar) o indica tu propio relay.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "AEGIS 404 v2.0.2"
git branch -M main
git remote add origin https://github.com/ivan7800/aegis-404.git
git push -u origin main
```

Luego: **Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `root` → Save.**
En un par de minutos estará en `https://ivan7800.github.io/aegis-404/`.

> El archivo `.nojekyll` ya está incluido para evitar el procesamiento Jekyll.

## Aviso legal

AEGIS 404 es una herramienta **defensiva y educativa**. No ataca ni explota sistemas: solo lee y evalúa el contenido público de una página. **Úsala únicamente sobre activos de tu propiedad o para los que tengas autorización escrita.** El testing sin permiso puede ser ilegal.

---

<div align="center">
<sub>Parte del ecosistema <b>Universo 404</b> · Licencia MIT</sub>
</div>
