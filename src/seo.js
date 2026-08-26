/**
 * robots.txt y sitemap.xml.
 *
 * En un directorio local la búsqueda es el canal de crecimiento: ya se decidió
 * renderizar las fichas en el servidor por eso mismo. Sin sitemap ese trabajo
 * queda a medias, porque el buscador tiene que adivinar qué páginas existen.
 */

import { origenCanonico } from "./auth/origen.js";

export async function rutasSeo(request, env, url) {
  if (url.pathname === "/robots.txt")  return robots(env, url);
  if (url.pathname === "/sitemap.xml") return await sitemap(env, url);
  return null;
}

function robots(env, url) {
  const origen = origenCanonico(env, url);
  const cuerpo = [
    "User-agent: *",
    "Allow: /",
    // Rutas privadas o sin valor para un buscador.
    "Disallow: /entrar",
    "Disallow: /agregar",
    "Disallow: /mis-lugares",
    "Disallow: /api/",
    "",
    `Sitemap: ${origen}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(cuerpo, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

async function sitemap(env, url) {
  const origen = origenCanonico(env, url);

  const { results } = await env.morelia.prepare(
    `SELECT id, actualizado_en FROM lugares WHERE estado = 'publicado'
      ORDER BY actualizado_en DESC LIMIT 5000`,
  ).all();

  const urls = [
    { loc: `${origen}/`, prioridad: "1.0" },
    { loc: `${origen}/explorar`, prioridad: "0.8" },
    ...(results ?? []).map((l) => ({
      loc: `${origen}/lugar/${l.id}`,
      prioridad: "0.6",
      lastmod: (l.actualizado_en || "").slice(0, 10) || undefined,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapar(u.loc)}</loc>${u.lastmod ? `
    <lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.prioridad}</priority>
  </url>`).join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
));
