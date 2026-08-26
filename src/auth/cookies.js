/**
 * Cookie de sesión.
 *
 * El prefijo __Host- es una garantía que impone el navegador: la cookie solo
 * se acepta con Secure, Path=/ y sin Domain, así que un subdominio comprometido
 * no puede sobrescribirla.
 */

export const COOKIE_SESION = "__Host-atarax_sesion";
export const COOKIE_ESTADO_OAUTH = "__Host-atarax_oauth";

const TREINTA_DIAS = 60 * 60 * 24 * 30;

export function cookieSesion(token, maxAge = TREINTA_DIAS) {
  return serializar(COOKIE_SESION, token, maxAge);
}

export function cookieBorrarSesion() {
  return serializar(COOKIE_SESION, "", 0);
}

export function cookieEstadoOauth(valor) {
  // Vive lo justo para completar el viaje de ida y vuelta a Google.
  return serializar(COOKIE_ESTADO_OAUTH, valor, 600);
}

export function cookieBorrarEstadoOauth() {
  return serializar(COOKIE_ESTADO_OAUTH, "", 0);
}

function serializar(nombre, valor, maxAge) {
  return [
    `${nombre}=${valor}`,
    "Path=/",
    "HttpOnly",          // fuera del alcance de JavaScript: un XSS no la roba
    "Secure",            // solo por HTTPS
    "SameSite=Lax",      // no viaja en peticiones cruzadas; frena CSRF
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function leerCookie(request, nombre) {
  const cabecera = request.headers.get("Cookie");
  if (!cabecera) return null;
  for (const parte of cabecera.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return null;
}
