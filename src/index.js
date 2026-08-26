/**
 * Atarax — Worker de borde.
 *
 * Sirve la aplicación desde Static Assets y añade cabeceras de seguridad
 * a cada respuesta. Las rutas /api/* y las de autenticación las resuelve
 * el Worker.
 */

import { rutasAuth } from "./auth/rutas.js";
import { rutasLugares } from "./lugares/rutas.js";
import { paginaError } from "./lugares/error.js";
import { rutasSeo } from "./seo.js";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: https://tile.openstreetmap.org",
    "connect-src 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), interest-cohort=()",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return withSecurityHeaders(
          Response.json({ status: "ok", app: "atarax" }),
        );
      }

      // Autenticación: enlace mágico y Google. Devuelve null si no le toca.
      const auth = await rutasAuth(request, env, ctx, url);
      if (auth) return withSecurityHeaders(auth);

      const lugares = await rutasLugares(request, env, ctx, url);
      if (lugares) return withSecurityHeaders(lugares);

      if (url.pathname.startsWith("/api/")) {
        return withSecurityHeaders(
          Response.json({ error: "not found" }, { status: 404 }),
        );
      }

      const seo = await rutasSeo(request, env, url);
      if (seo) return withSecurityHeaders(seo);

      // Todo lo demás lo resuelve el almacén de assets.
      const asset = await env.ASSETS.fetch(request);

      // Un 404 del almacén llega sin estilo: se sustituye por la página con
      // marca. Un 404 en texto plano parece un sitio caído, no una ruta que
      // no existe.
      if (asset.status === 404 && !url.pathname.includes(".")) {
        return withSecurityHeaders(paginaError({ codigo: 404 }));
      }
      return withSecurityHeaders(asset);
    } catch (err) {
      console.error("unhandled", { path: url.pathname, message: String(err) });
      return withSecurityHeaders(
        Response.json({ error: "internal error" }, { status: 500 }),
      );
    }
  },
};
