/**
 * Primitivas de token. Todo lo aleatorio sale de Web Crypto: Math.random()
 * es predecible y no sirve para nada que proteja una sesión.
 */

/** Token opaco de 256 bits, en base64url (seguro en URL y en cookie). */
export function nuevoToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * Los tokens se guardan hasheados. Si alguien lee la base de datos, lo que
 * encuentra no le sirve para iniciar sesión.
 */
export async function hashToken(token) {
  const datos = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nuevoId() {
  return crypto.randomUUID();
}

function base64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Fecha ISO desplazada N segundos, en el formato que usa SQLite. */
export function enSegundos(segundos) {
  return new Date(Date.now() + segundos * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export function ahora() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
