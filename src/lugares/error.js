/**
 * Página de error con la identidad del sitio.
 *
 * Existe porque devolver texto plano rompe la marca justo cuando alguien ya
 * está desorientado: un 404 sin estilo parece un sitio caído, no una página
 * que no existe.
 */

export function paginaError({ codigo = 404, titulo, mensaje, origen = "" }) {
  const t = titulo ?? (codigo === 404 ? "Aquí no hay nada" : "Algo salió mal");
  const m = mensaje ?? (codigo === 404
    ? "El lugar que buscas ya no existe, o su enlace cambió."
    : "Inténtalo de nuevo en un momento.");

  return new Response(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${codigo} — Atarax</title>
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#12100F" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preload" href="/fonts/fraunces-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/inter-normal.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/styles.css" />
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

<main class="error">
  <!-- Un solo arco del acueducto: el motivo de la marca, aquí roto. -->
  <svg class="error__arco" viewBox="0 0 200 130" aria-hidden="true" focusable="false">
    <path d="M20 130V70a50 50 0 0 1 45-49.8" fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round"/>
    <path d="M180 130V70a50 50 0 0 0-45-49.8" fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" opacity=".55"/>
    <circle cx="100" cy="14" r="2.5" fill="currentColor" opacity=".5"/>
  </svg>

  <p class="error__codigo">${codigo}</p>
  <h1 class="error__titulo">${t}</h1>
  <p class="error__mensaje">${m}</p>

  <div class="error__salidas">
    <a class="btn btn--solido" href="/explorar">Explorar lugares</a>
    <a class="btn btn--ghost" href="/">Volver al inicio</a>
  </div>
</main>

</body>
</html>`, {
    status: codigo,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
