<div align="center">

# 🛡️ AEGIS 404

### Suite de Análisis de Seguridad Web

**Auditoría defensiva 100% local — sin servidor, sin dependencias, sin telemetría.**

[![PWA](https://img.shields.io/badge/PWA-instalable-e8a13a)](#)
[![Sin dependencias](https://img.shields.io/badge/dependencias-0-49d6c8)](#)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-3fbf7a)](LICENSE)
[![Universo 404](https://img.shields.io/badge/Universo-404-c9d6e6)](#)

</div>

---

## ¿Qué es?

**AEGIS 404** es una herramienta de análisis de seguridad para **pentesting ético y auto-auditoría**. Todo el procesamiento ocurre en tu navegador: pegas el activo que quieres analizar (cabeceras, política, código, token, cookies) y obtienes hallazgos accionables por severidad, listos para exportar como informe.

> ⚠️ **Nota técnica honesta:** una app estática **no puede escanear webs de terceros** — la política *same-origin*/CORS del navegador lo impide. Por eso AEGIS analiza datos que **tú aportas manualmente** (lo correcto para auditoría autorizada). Incluye un *bookmarklet* para recoger las cabeceras de **tu propia** página.

## Módulos

| Módulo | Qué hace |
|---|---|
| **⛨ Cabeceras HTTP** | Evalúa CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP y detecta divulgación de tecnología. Nota **A–F** ponderada. |
| **⧉ CSP** | Audita políticas (`unsafe-inline`/`unsafe-eval`, comodines, directivas ausentes) y **construye** una política endurecida. |
| **⟨⟩ Escáner de código** | SAST ligero: 16 reglas para XSS por DOM, `eval`, secretos embebidos, enlaces HTTP, `postMessage`, `localStorage` sensible… con nº de línea. |
| **⬡ JWT** | Decodifica header/payload y detecta `alg:none`, ausencia de `exp`, claims sensibles. **No** envía el token a ningún sitio. |
| **◫ Cookies** | Verifica `Secure`, `HttpOnly`, `SameSite` y prefijos `__Host-`/`__Secure-`. |
| **☰ OWASP Top 10** | Referencia 2021 + checklist de cobertura que genera hallazgos. |
| **▤ CVSS v3.1** | Calculadora de severidad con Base Score **verificado contra vectores oficiales** y vector exportable. |
| **⚙ Utilidades** | Base64/URL/Hex/entidades HTML, hashes SHA-1/256/384/512 (WebCrypto), generador de nonce, analizador de entropía de contraseñas. |
| **▦ Informe** | Consolida todos los hallazgos y exporta a **Markdown · JSON · HTML autónomo · PDF (imprimir)**. |

## Características

- **Cero dependencias.** Un único `index.html` con HTML, CSS y JS vanilla.
- **Offline / PWA.** Instalable y funcional sin conexión.
- **Privado por diseño.** Nada sale de tu dispositivo. Sin analítica, sin peticiones externas.
- **Responsive.** Diseñado móvil-primero, con foco de teclado visible y `prefers-reduced-motion`.

## Uso

1. Abre `index.html` (o la URL de GitHub Pages).
2. Acepta la barrera de uso ético.
3. Elige un módulo, pega tu activo y pulsa **Analizar**.
4. Ve a **Informe** y exporta.

### Bookmarklet de auto-inspección
En el módulo *Cabeceras* hay un botón que copia un bookmarklet. Créalo como marcador **en tu propia web**, púlsalo y pega las cabeceras en AEGIS.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "AEGIS 404 v1.0.0"
git branch -M main
git remote add origin https://github.com/ivan7800/aegis-404.git
git push -u origin main
```

Luego: **Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `root` → Save.**
En un par de minutos estará en `https://ivan7800.github.io/aegis-404/`.

> El archivo `.nojekyll` ya está incluido para evitar el procesamiento Jekyll.

## Aviso legal

AEGIS 404 es una herramienta **defensiva y educativa**. No ataca ni explota sistemas: solo evalúa datos que pega el usuario. **Úsala únicamente sobre activos de tu propiedad o para los que tengas autorización escrita.** El testing sin permiso puede ser ilegal.

---

<div align="center">
<sub>Parte del ecosistema <b>Universo 404</b> · Licencia MIT</sub>
</div>
