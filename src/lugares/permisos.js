/**
 * Permisos sobre lugares.
 *
 * Modelo actual: quien crea un lugar es su dueño y solo él puede editarlo.
 * La comprobación vive aquí, en un solo sitio, en vez de repetirse en cada
 * endpoint: la autorización duplicada es como aparecen los agujeros, porque
 * basta olvidarla en una ruta nueva.
 *
 * Está escrito para admitir roles más adelante (moderación, administración)
 * sin tocar las rutas: bastaría ampliar `decidir`.
 */

import { usuarioDeSesion } from "../auth/sesiones.js";
import { COOKIE_SESION, leerCookie } from "../auth/cookies.js";

export const PERMITIDO = "permitido";
export const SIN_SESION = "sin_sesion";
export const NO_ES_TUYO = "no_es_tuyo";
export const NO_EXISTE = "no_existe";

/**
 * ¿Puede este usuario editar este lugar?
 * Devuelve { veredicto, usuario, lugar } — nunca lanza.
 */
export async function puedeEditar(request, env, lugarId) {
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  if (!usuario) return { veredicto: SIN_SESION, usuario: null, lugar: null };

  const lugar = await env.morelia.prepare(
    "SELECT id, creado_por, tipo, nombre, estado FROM lugares WHERE id = ?",
  ).bind(lugarId).first();

  if (!lugar) return { veredicto: NO_EXISTE, usuario, lugar: null };

  return { veredicto: decidir(usuario, lugar), usuario, lugar };
}

function decidir(usuario, lugar) {
  // Único criterio por ahora: ser el autor.
  if (lugar.creado_por && lugar.creado_por === usuario.id) return PERMITIDO;
  return NO_ES_TUYO;
}

/**
 * Convierte un veredicto en respuesta HTTP.
 *
 * 404 y no 403 cuando el lugar no existe *y también* cuando existe pero no es
 * tuyo sería lo más hermético; aquí se prefiere 403 explícito porque los
 * lugares son públicos y su existencia no es secreta: ocultarla solo
 * confundiría a quien se equivocó de cuenta.
 */
export function respuestaDenegada(veredicto) {
  if (veredicto === SIN_SESION) {
    return Response.json({ error: "necesitas iniciar sesión" }, { status: 401 });
  }
  if (veredicto === NO_EXISTE) {
    return Response.json({ error: "no encontrado" }, { status: 404 });
  }
  if (veredicto === NO_ES_TUYO) {
    return Response.json({ error: "solo quien lo publicó puede editarlo" }, { status: 403 });
  }
  return null;
}
