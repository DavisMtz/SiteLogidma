/**
 * Ficha de un lugar, renderizada en el servidor.
 *
 * Se renderiza aquí y no en el cliente por una razón concreta: en un
 * directorio local el canal de crecimiento es la búsqueda. Un vecino que
 * googlea «plomero villas del pedregal» debe encontrar esta página, y los
 * buscadores indexan mal lo que se pinta con JavaScript. Además permite
 * incrustar JSON-LD, que es lo que habilita los resultados enriquecidos.
 */

import { enlaceGoogle } from "./calendario.js";

const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const TIPO_ES = { negocio: "Negocio", servicio: "Servicio", evento: "Evento" };

function precio(item) {
  if (item.precio_centavos == null) return null;
  const monto = (item.precio_centavos / 100).toLocaleString("es-MX", {
    style: "currency", currency: item.moneda || "MXN",
  });
  const partes = [item.desde ? `desde ${monto}` : monto];
  if (item.unidad) partes.push(item.unidad);
  return partes.join(" · ");
}

function fechaLarga(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(d);
}

const RRULE_ES = {
  "FREQ=DAILY": "Todos los días",
  "FREQ=WEEKLY": "Cada semana",
  "FREQ=MONTHLY": "Cada mes",
};
const DIAS = { MO: "lunes", TU: "martes", WE: "miércoles", TH: "jueves", FR: "viernes", SA: "sábado", SU: "domingo" };

/** RRULE es estándar pero ilegible: se traduce a algo que una persona entienda. */
function repeticionEnPalabras(rrule) {
  if (!rrule) return null;
  const partes = Object.fromEntries(rrule.split(";").map((p) => p.split("=")));
  const base = RRULE_ES[`FREQ=${partes.FREQ}`] ?? "Se repite";
  if (partes.BYDAY) {
    const dias = partes.BYDAY.split(",").map((d) => DIAS[d.slice(-2)]).filter(Boolean);
    if (dias.length) return `${base}: ${dias.join(", ")}`;
  }
  return base;
}

/** JSON-LD para resultados enriquecidos. Event y LocalBusiness según el tipo. */
function datosEstructurados(l, secciones, origen) {
  const url = `${origen}/lugar/${l.id}`;
  const direccion = {
    "@type": "PostalAddress",
    streetAddress: l.direccion || undefined,
    addressLocality: "Morelia",
    addressRegion: "Michoacán",
    addressCountry: "MX",
  };

  if (l.tipo === "evento") {
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: l.nombre,
      description: l.descripcion || undefined,
      startDate: l.inicia_en || undefined,
      endDate: l.termina_en || undefined,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      url,
      // Google exige location con name y address para el resultado enriquecido.
      location: {
        "@type": "Place",
        name: l.colonia || l.nombre,
        address: direccion,
        geo: l.lat != null ? { "@type": "GeoCoordinates", latitude: l.lat, longitude: l.lng } : undefined,
      },
    };
  }

  const catalogo = secciones.length ? {
    "@type": "OfferCatalog",
    name: "Catálogo",
    itemListElement: secciones.map((s) => ({
      "@type": "OfferCatalog",
      name: s.nombre,
      itemListElement: s.items.map((i) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: i.nombre, description: i.descripcion || undefined },
        price: i.precio_centavos != null ? (i.precio_centavos / 100).toFixed(2) : undefined,
        priceCurrency: i.precio_centavos != null ? (i.moneda || "MXN") : undefined,
      })),
    })),
  } : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: l.nombre,
    description: l.descripcion || undefined,
    url,
    telephone: l.telefono || undefined,
    address: direccion,
    geo: l.lat != null ? { "@type": "GeoCoordinates", latitude: l.lat, longitude: l.lng } : undefined,
    openingHours: l.horario || undefined,
    hasOfferCatalog: catalogo,
  };
}

function limpiar(o) {
  return JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? undefined : v)));
}

export function renderFicha(l, secciones, sesion, origen, esMio = false) {
  const esEvento = l.tipo === "evento";
  const jsonld = JSON.stringify(limpiar(datosEstructurados(l, secciones, origen)));
  const repeticion = repeticionEnPalabras(l.recurrencia);

  const contacto = sesion
    ? [
        l.telefono  && `<a class="dato__val dato__enlace" href="tel:${e(l.telefono.replace(/\s/g, ""))}">${e(l.telefono)}</a>`,
        l.whatsapp  && `<a class="dato__val dato__enlace" rel="noopener noreferrer nofollow" href="https://wa.me/${e(l.whatsapp.replace(/\D/g, ""))}">WhatsApp</a>`,
        l.sitio_web && `<a class="dato__val dato__enlace" rel="noopener noreferrer nofollow" target="_blank" href="${e(l.sitio_web)}">Sitio web</a>`,
      ].filter(Boolean).join("")
    : "";

  const catalogoHtml = secciones.length ? `
    <section class="catalogo">
      <h2 class="ficha__h2">${esEvento ? "Programa" : "Catálogo"}</h2>
      ${secciones.map((s) => `
        <section class="seccion">
          <h3 class="seccion__nombre">${e(s.nombre)}</h3>
          ${s.descripcion ? `<p class="seccion__desc">${e(s.descripcion)}</p>` : ""}
          <ul class="items">
            ${s.items.map((i) => `
              <li class="item${i.disponible ? "" : " item--agotado"}">
                <div class="item__cab">
                  <span class="item__nombre">${e(i.nombre)}</span>
                  ${precio(i) ? `<span class="item__precio">${e(precio(i))}</span>` : ""}
                </div>
                ${i.descripcion ? `<p class="item__desc">${e(i.descripcion)}</p>` : ""}
                ${i.disponible ? "" : '<span class="item__nota">No disponible</span>'}
              </li>`).join("")}
          </ul>
        </section>`).join("")}
    </section>` : "";

  const calendarioHtml = esEvento && l.inicia_en ? `
    <div class="calendario">
      <a class="btn btn--solido" href="/api/lugares/${e(l.id)}/ics">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <rect x="3" y="4.5" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <path d="M3 8.5h14M7 3v3M13 3v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Añadir al calendario
      </a>
      <a class="btn btn--ghost" rel="noopener noreferrer" target="_blank" href="${e(enlaceGoogle(l))}">Google Calendar</a>
    </div>` : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(l.nombre)} — Atarax</title>
<meta name="description" content="${e((l.descripcion || `${TIPO_ES[l.tipo]} en ${l.colonia || "Morelia"}`).slice(0, 155))}" />
<meta name="theme-color" content="#12100F" />
<link rel="canonical" href="${e(origen)}/lugar/${e(l.id)}" />
<meta property="og:title" content="${e(l.nombre)}" />
<meta property="og:type" content="${esEvento ? "article" : "website"}" />
<meta property="og:description" content="${e((l.descripcion || "").slice(0, 155))}" />
<meta property="og:site_name" content="Atarax" />
<meta property="og:locale" content="es_MX" />
<meta property="og:url" content="${e(origen)}/lugar/${e(l.id)}" />
<meta property="og:image" content="${e(origen)}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preload" href="/fonts/fraunces-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/inter-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/styles.css" />
<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script>
</head>
<body>

<header class="nav">
  <a class="nav__brand" href="/" aria-label="Atarax, inicio">
    <svg class="nav__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M4 26V16a12 12 0 0 1 24 0v10" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/>
      <path d="M11 26v-9a5 5 0 0 1 10 0v9" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" opacity=".55"/>
    </svg>
    <span>Atarax</span>
  </a>
  <a class="btn btn--ghost" href="/explorar">Explorar</a>
</header>

<main class="ficha">
  ${esMio ? `<p class="ficha__duenio"><span>Publicaste este lugar</span> <a class="btn btn--ghost" href="/agregar?id=${e(l.id)}">Editar</a> <a class="btn btn--ghost" href="/mis-lugares">Mis lugares</a></p>` : ""}

  <p class="ficha__migas"><a href="/explorar?tipo=${e(l.tipo)}">${TIPO_ES[l.tipo]}s</a> ${l.categoria ? `· ${e(l.categoria)}` : ""}</p>

  <h1 class="ficha__titulo">${e(l.nombre)}</h1>
  ${l.descripcion ? `<p class="ficha__desc">${e(l.descripcion)}</p>` : ""}

  ${calendarioHtml}

  <dl class="datos">
    ${esEvento && l.inicia_en ? `<div class="dato"><dt>Cuándo</dt><dd>${e(fechaLarga(l.inicia_en))}${l.termina_en ? ` — ${e(fechaLarga(l.termina_en))}` : ""}</dd></div>` : ""}
    ${repeticion ? `<div class="dato"><dt>Repite</dt><dd>${e(repeticion)}</dd></div>` : ""}
    ${l.horario ? `<div class="dato"><dt>Horario</dt><dd>${e(l.horario)}</dd></div>` : ""}
    <div class="dato"><dt>Dónde</dt><dd>${e([sesion ? l.direccion : null, l.colonia, "Morelia"].filter(Boolean).join(", "))}</dd></div>
    ${contacto ? `<div class="dato"><dt>Contacto</dt><dd class="dato__contacto">${contacto}</dd></div>` : ""}
  </dl>

  ${!sesion && l.tiene_contacto ? `
    <p class="candado">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      <span>Contacto y dirección exacta · </span><a href="/entrar">inicia sesión</a>
    </p>` : ""}

  ${catalogoHtml}
</main>

<script type="module" src="/js/ficha.js"></script>
</body>
</html>`;
}
