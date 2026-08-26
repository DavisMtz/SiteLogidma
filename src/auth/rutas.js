/**
 * Rutas de autenticación.
 *
 * Devuelve una Response, o null si la ruta no le corresponde.
 */

import { nuevoToken } from "./crypto.js";
import { COOKIE_SESION, COOKIE_ESTADO_OAUTH, cookieSesion, cookieBorrarSesion,
         cookieEstadoOauth, cookieBorrarEstadoOauth, leerCookie } from "./cookies.js";
import { crearSesion, cerrarSesion, usuarioDeSesion, usuarioPorEmail } from "./sesiones.js";
import { crearEnlace, canjearEnlace, correoDeAcceso } from "./enlace-magico.js";
import { excedeLimite, purgarIntentos } from "./limites.js";
import { enviarCorreo } from "./correo.js";
import * as google from "./google.js";
import { origenCanonico } from "./origen.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function rutasAuth(request, env, ctx, url) {
  const ruta = url.pathname;

  if (ruta === "/api/auth/yo")               return await quienSoy(request, env);
  if (ruta === "/api/auth/enlace")           return await pedirEnlace(request, env, ctx, url);
  if (ruta === "/entrar/verificar")          return await verificarEnlace(request, env, url);
  if (ruta === "/api/auth/salir")            return await salir(request, env);
  if (ruta === "/api/auth/google")           return await iniciarGoogle(request, env, url);
  if (ruta === "/api/auth/google/callback")  return await volverDeGoogle(request, env, url);

  return null;
}

/** Estado de sesión para que la cabecera se pinte correctamente. */
async function quienSoy(request, env) {
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  return Response.json(usuario ? { sesion: true, usuario } : { sesion: false });
}

async function pedirEnlace(request, env, ctx, url) {
  if (request.method !== "POST") return metodoNoPermitido();

  const cuerpo = await request.json().catch(() => null);
  const email = typeof cuerpo?.email === "string" ? cuerpo.email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "correo no válido" }, { status: 400 });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "desconocida";
  const db = env.morelia;

  // Dos límites: por correo (evita machacar un buzón) y por IP (evita barridos).
  if (await excedeLimite(db, `email:${email}`, 5) || await excedeLimite(db, `ip:${ip}`, 20)) {
    return Response.json(
      { error: "demasiados intentos, espera unos minutos" },
      { status: 429, headers: { "retry-after": "900" } },
    );
  }

  const token = await crearEnlace(db, email, ip);
  const enlace = `${origenCanonico(env, url)}/entrar/verificar?token=${token}`;
  const { asunto, texto, html } = correoDeAcceso(enlace);

  const entregado = await enviarCorreo(env, {
    para: email, asunto, texto, html, enlaceDev: enlace,
  });

  ctx.waitUntil(purgarIntentos(db));

  // Respuesta idéntica exista o no la cuenta: no se filtra quién está registrado.
  return Response.json({
    ok: true,
    mensaje: "Si el correo es válido, recibirás un enlace en unos segundos.",
    ...(entregado ? {} : { aviso: "correo_no_configurado" }),
  });
}

async function verificarEnlace(request, env, url) {
  const email = await canjearEnlace(env.morelia, url.searchParams.get("token"));
  if (!email) return Response.redirect(`${url.origin}/entrar?error=enlace`, 302);

  const usuario = await usuarioPorEmail(env.morelia, email);
  const { token, maxAge } = await crearSesion(env.morelia, usuario.id, request.headers.get("User-Agent"));

  return new Response(null, {
    status: 302,
    headers: { location: `${url.origin}/`, "set-cookie": cookieSesion(token, maxAge) },
  });
}

async function salir(request, env) {
  if (request.method !== "POST") return metodoNoPermitido();
  await cerrarSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  return Response.json({ ok: true }, { headers: { "set-cookie": cookieBorrarSesion() } });
}

async function iniciarGoogle(request, env, url) {
  if (!google.configurado(env)) {
    return Response.redirect(`${url.origin}/entrar?error=google_no_configurado`, 302);
  }
  const state = nuevoToken();
  return new Response(null, {
    status: 302,
    headers: {
      location: google.urlAutorizacion(env, origenCanonico(env, url), state),
      "set-cookie": cookieEstadoOauth(state),
    },
  });
}

async function volverDeGoogle(request, env, url) {
  const fallo = (motivo) => new Response(null, {
    status: 302,
    headers: { location: `${url.origin}/entrar?error=${motivo}`, "set-cookie": cookieBorrarEstadoOauth() },
  });

  if (!google.configurado(env)) return fallo("google_no_configurado");

  const esperado = leerCookie(request, COOKIE_ESTADO_OAUTH);
  const recibido = url.searchParams.get("state");
  // Sin state válido no se sigue: es lo que impide un callback forzado.
  if (!esperado || !recibido || esperado !== recibido) return fallo("estado");

  const code = url.searchParams.get("code");
  if (!code) return fallo("google");

  let perfil;
  try {
    perfil = await google.perfilDesdeCodigo(env, origenCanonico(env, url), code);
  } catch (err) {
    console.error("google_oauth_fallido", { message: String(err) });
    return fallo("google");
  }

  const usuario = await usuarioPorEmail(env.morelia, perfil.email, {
    nombre: perfil.nombre, avatar_url: perfil.avatar_url,
  });
  await google.enlazarCuenta(env.morelia, perfil.sub, usuario.id);

  const { token, maxAge } = await crearSesion(env.morelia, usuario.id, request.headers.get("User-Agent"));

  return new Response(null, {
    status: 302,
    headers: [
      ["location", `${url.origin}/`],
      ["set-cookie", cookieBorrarEstadoOauth()],
      ["set-cookie", cookieSesion(token, maxAge)],
    ],
  });
}

function metodoNoPermitido() {
  return Response.json({ error: "método no permitido" }, { status: 405 });
}
