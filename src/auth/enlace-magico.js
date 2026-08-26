/**
 * Acceso por enlace mágico.
 *
 * Reglas que sostienen la seguridad del flujo:
 *  - el token va hasheado en la base de datos;
 *  - caduca en 15 minutos;
 *  - un solo uso: al canjearlo se marca y deja de servir;
 *  - la respuesta es idéntica exista o no el correo, para no filtrar quién
 *    tiene cuenta (enumeración de usuarios).
 */

import { nuevoToken, hashToken, enSegundos, ahora } from "./crypto.js";

const VIGENCIA = 15 * 60;

export async function crearEnlace(db, email, ip) {
  const token = nuevoToken();
  await db.prepare(
    "INSERT INTO enlaces_acceso (token_hash, email, expira_en, ip_solicitud) VALUES (?, ?, ?, ?)",
  ).bind(await hashToken(token), email.trim().toLowerCase(), enSegundos(VIGENCIA), ip ?? null).run();
  return token;
}

/** Canjea el token. Devuelve el correo, o null si es inválido, caducado o ya usado. */
export async function canjearEnlace(db, token) {
  if (!token) return null;
  const hash = await hashToken(token);

  const fila = await db.prepare(
    "SELECT email FROM enlaces_acceso WHERE token_hash = ? AND usado_en IS NULL AND expira_en > ?",
  ).bind(hash, ahora()).first();

  if (!fila) return null;

  // Marcar como usado en la misma condición evita que dos peticiones
  // simultáneas canjeen el mismo enlace.
  const marcado = await db.prepare(
    "UPDATE enlaces_acceso SET usado_en = ? WHERE token_hash = ? AND usado_en IS NULL",
  ).bind(ahora(), hash).run();

  if (!marcado.meta?.changes) return null;
  return fila.email;
}

export function correoDeAcceso(enlace) {
  const texto = [
    "Entra a Atarax",
    "",
    "Abre este enlace para iniciar sesión:",
    enlace,
    "",
    "El enlace caduca en 15 minutos y solo funciona una vez.",
    "Si no lo pediste, ignora este mensaje.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#12100F;font-family:system-ui,sans-serif;color:#F5F0EB">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px">
    <h1 style="font-size:22px;font-weight:500;margin:0 0 8px">Entra a Atarax</h1>
    <p style="color:#A79A91;margin:0 0 28px;line-height:1.6">
      Abre este enlace para iniciar sesión.
    </p>
    <a href="${escaparHtml(enlace)}"
       style="display:inline-block;padding:13px 26px;border-radius:999px;background:#E3A0A8;color:#2A1418;text-decoration:none;font-weight:600">
      Iniciar sesión
    </a>
    <p style="color:#6E635C;font-size:13px;margin:28px 0 0;line-height:1.6">
      Caduca en 15 minutos y solo funciona una vez.<br>Si no lo pediste, ignora este mensaje.
    </p>
  </div>
</body></html>`;

  return { asunto: "Tu acceso a Atarax", texto, html };
}

function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
