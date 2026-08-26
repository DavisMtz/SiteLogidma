/**
 * Límite de peticiones para el endpoint de acceso, que es el que se ataca.
 * Ventana fija por clave (correo o IP): simple, suficiente, y sin estado extra.
 */

const VENTANA_MIN = 15;

export async function excedeLimite(db, clave, maximo) {
  const ventana = ventanaActual();

  await db.prepare(
    `INSERT INTO intentos_acceso (clave, ventana_en, intentos) VALUES (?, ?, 1)
     ON CONFLICT(clave, ventana_en) DO UPDATE SET intentos = intentos + 1`,
  ).bind(clave, ventana).run();

  const fila = await db.prepare(
    "SELECT intentos FROM intentos_acceso WHERE clave = ? AND ventana_en = ?",
  ).bind(clave, ventana).first();

  return (fila?.intentos ?? 0) > maximo;
}

function ventanaActual() {
  const ms = VENTANA_MIN * 60 * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Limpia ventanas viejas. Se llama en segundo plano con ctx.waitUntil. */
export async function purgarIntentos(db) {
  const corte = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  await db.prepare("DELETE FROM intentos_acceso WHERE ventana_en < ?").bind(corte).run();
}
