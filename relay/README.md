# Relay CORS propio para AEGIS 404

El escáner de URL de AEGIS necesita leer el HTML de webs de terceros. El navegador lo impide por la política *same-origin*, así que hace falta un intermediario que devuelva la página con cabeceras CORS abiertas.

Los relays públicos gratuitos que AEGIS trae por defecto **son inestables**: se caen, aplican *rate-limit* y devuelven 403. Con tu propio Worker el escáner pasa de *«a veces funciona»* a *«funciona»*.

**Coste: 0 €.** El plan gratuito de Cloudflare da 100 000 peticiones al día.

---

## Opción A — desde el navegador (5 minutos, sin instalar nada)

1. Entra en <https://dash.cloudflare.com> y crea una cuenta si no la tienes.
2. Menú lateral → **Workers & Pages** → **Create** → **Start with Hello World!** → **Deploy**.
3. Pulsa **Edit code**. Borra todo lo que haya y pega el contenido de [`worker.js`](./worker.js).
4. En la constante `ALLOWED_ORIGINS`, deja solo los orígenes desde los que usarás AEGIS. Por ejemplo:

   ```js
   const ALLOWED_ORIGINS = [
     'https://ivan7800.github.io',
     'http://localhost:8000',
   ];
   ```

5. **Deploy**. Cloudflare te dará una URL del estilo `https://mi-relay.tu-usuario.workers.dev`.
6. En AEGIS 404 → **Escáner de URL** → **Opciones avanzadas**, pega:

   ```
   https://mi-relay.tu-usuario.workers.dev/?url=
   ```

   ⚠️ El sufijo `/?url=` es obligatorio. AEGIS detecta el `=` final y añade la URL objetivo codificada.

7. Pulsa **Probar**. Si sale `✓ Tu relay funciona`, ya está: queda guardado y se usará en todos los escaneos.

---

## Opción B — desde la terminal (wrangler)

```bash
npm install -g wrangler
wrangler login
cd relay
wrangler deploy
```

`wrangler.toml` ya está configurado. Al terminar, la URL aparece en la salida del comando.

---

## Qué hace el Worker (y qué no)

| | |
|---|---|
| ✅ | Trae el HTML de la URL objetivo y lo devuelve con CORS abierto |
| ✅ | **Restringe el origen**: solo responde a los dominios de `ALLOWED_ORIGINS` |
| ✅ | **Bloquea SSRF**: rechaza `localhost`, `127.0.0.1`, rangos privados (`10.x`, `192.168.x`, `172.16–31.x`) y los endpoints de metadatos de nube (`169.254.169.254`) |
| ✅ | Limita a 5 MB y 15 s por petición |
| ✅ | Devuelve `text/plain` + `nosniff`, para que la respuesta nunca se renderice como HTML |
| ❌ | No cachea nada |
| ❌ | No registra las URLs que escaneas |

> **Importante:** si dejas `ALLOWED_ORIGINS` abierto a `*`, habrás publicado un **proxy abierto** en internet. Acabará usándose para abusar de terceros desde tu cuenta. Mantén la lista corta.

---

## Comprobar que funciona sin abrir AEGIS

```bash
curl -s -H "Origin: https://ivan7800.github.io" \
  "https://mi-relay.tu-usuario.workers.dev/?url=https%3A%2F%2Fexample.com%2F" | head -5
```

Debe imprimir el HTML de `example.com`. Y estas dos peticiones deben fallar:

```bash
# origen no autorizado -> 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.test" \
  "https://mi-relay.tu-usuario.workers.dev/?url=https%3A%2F%2Fexample.com%2F"

# SSRF a red privada -> 403
curl -s -H "Origin: https://ivan7800.github.io" \
  "https://mi-relay.tu-usuario.workers.dev/?url=http%3A%2F%2F169.254.169.254%2F"
```

---

## Si no quieres usar Cloudflare

Cualquier endpoint que acepte `?url=<url-codificada>` y devuelva el cuerpo con `Access-Control-Allow-Origin` sirve. Vale un contenedor con `Deno.serve`, una función de Vercel, o un `nginx` con `add_header`. Copia la lógica de validación de `worker.js`: **el bloqueo de SSRF y la restricción de origen no son opcionales.**
