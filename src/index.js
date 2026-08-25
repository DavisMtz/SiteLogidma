export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", app: "atarax" });
    }

    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};

const HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atarax</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        background: #0f1115;
        color: #f5f6f8;
      }
      h1 { font-size: clamp(1.75rem, 6vw, 3rem); font-weight: 600; margin: 0; }
    </style>
  </head>
  <body>
    <h1>Bienvenidos a Tracks</h1>
  </body>
</html>
`;
