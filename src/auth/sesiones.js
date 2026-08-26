/**
 * Sesiones respaldadas por D1.
 *
 * Se guardan en base de datos y no en un JWT autocontenido porque así se
 * pueden revocar: cerrar sesión en un dispositivo, o expulsar a un usuario,
 * es un DELETE. Con un JWT firmado habría que esperar a que caduque.
 */

import { nuevoToken, hashToken, nuevoId, enSegundos, ahora } from "./crypto.js";

const DURACION = 60 * 60 * 24 * 30; // 30 días

export async function crearSesion(db, userId, userAgent) {
  const token = nuevoToken();
  await db.prepare(
    "INSERT INTO sesiones (token_hash, user_id, expira_en, user_agent) VALUES (?, ?, ?, ?)",
  ).bind(await hashToken(token), userId, enSegundos(DURACION), userAgent?.slice(0, 255) ?? null).run();
  return { token, maxAge: DURACION };
}

/** Devuelve el usuario de la sesión, o null. Nunca lanza por token inválido. */
export async function usuarioDeSesion(db, token) {
  if (!token) return null;
  const fila = await db.prepare(
    `SELECT u.id, u.email, u.nombre, u.avatar_url
       FROM sesiones s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expira_en > ?`,
  ).bind(await hashToken(token), ahora()).first();
  return fila ?? null;
}

export async function cerrarSesion(db, token) {
  if (!token) return;
  await db.prepare("DELETE FROM sesiones WHERE token_hash = ?")
    .bind(await hashToken(token)).run();
}

/**
 * Busca al usuario por correo o lo crea. El correo es la identidad: así, quien
 * entró una vez por enlace mágico y otra por Google acaba en la misma cuenta.
 */
export async function usuarioPorEmail(db, email, datos = {}) {
  const normalizado = email.trim().toLowerCase();

  const existente = await db.prepare("SELECT id, email, nombre, avatar_url FROM users WHERE email = ?")
    .bind(normalizado).first();

  if (existente) {
    await db.prepare("UPDATE users SET ultimo_acceso = ?, email_verificado = 1 WHERE id = ?")
      .bind(ahora(), existente.id).run();
    return existente;
  }

  const id = nuevoId();
  await db.prepare(
    `INSERT INTO users (id, email, nombre, avatar_url, email_verificado, ultimo_acceso)
     VALUES (?, ?, ?, ?, 1, ?)`,
  ).bind(id, normalizado, datos.nombre ?? null, datos.avatar_url ?? null, ahora()).run();

  return { id, email: normalizado, nombre: datos.nombre ?? null, avatar_url: datos.avatar_url ?? null };
}
