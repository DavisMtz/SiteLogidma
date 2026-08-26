/**
 * Lugares: negocios, servicios y eventos.
 *
 * Lectura pública (buscar no requiere cuenta). Escritura con sesión.
 */

import { nuevoId, ahora } from "../auth/crypto.js";
import { usuarioDeSesion } from "../auth/sesiones.js";
import { COOKIE_SESION, leerCookie } from "../auth/cookies.js";

const TIPOS = new Set(["negocio", "servicio", "evento"]);
const LIMITE = 200;

/**
 * Dos proyecciones según haya sesión o no.
 *
 * Sin sesión se ve lo suficiente para juzgar si el lugar sirve —qué es, dónde
 * queda por zona, a qué hora abre— pero no cómo contactarlo. Ese es el
 * incentivo para registrarse.
 *
 * El recorte se hace en el SQL, no en el cliente: enviar el teléfono y
 * esconderlo con CSS lo dejaría a la vista de cualquiera que abra las
 * herramientas del navegador.
 *
 * La ubicación pública se redondea a tres decimales (~110 m): basta para
 * situar el lugar en su colonia sin señalar el portal exacto.
 */
const CAMPOS_PUBLICOS = `id, tipo, nombre, descripcion, categoria, colonia,
                ROUND(lat, 3) AS lat, ROUND(lng, 3) AS lng,
                horario, inicia_en, termina_en, creado_en,
                CASE WHEN telefono IS NOT NULL OR whatsapp IS NOT NULL
                       OR direccion IS NOT NULL OR sitio_web IS NOT NULL
                     THEN 1 ELSE 0 END AS tiene_contacto`;

const CAMPOS_COMPLETOS = `id, tipo, nombre, descripcion, categoria, direccion, colonia,
                lat, lng, telefono, whatsapp, sitio_web, horario,
                inicia_en, termina_en, creado_en, 1 AS tiene_contacto`;

const campos = (haySesion) => (haySesion ? CAMPOS_COMPLETOS : CAMPOS_PUBLICOS);

export async function rutasLugares(request, env, ctx, url) {
  const ruta = url.pathname;

  if (ruta === "/api/lugares") {
    if (request.method === "GET")  return await listar(request, env, url);
    if (request.method === "POST") return await crear(request, env);
    return Response.json({ error: "método no permitido" }, { status: 405 });
  }

  const detalle = ruta.match(/^\/api\/lugares\/([A-Za-z0-9-]{36})$/);
  if (detalle) return await verUno(request, env, detalle[1]);

  return null;
}

/** ¿Hay sesión? Determina qué campos se devuelven. */
async function haySesion(request, env) {
  return Boolean(await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION)));
}

async function listar(request, env, url) {
  const sesion = await haySesion(request, env);
  const p = url.searchParams;
  const condiciones = ["estado = 'publicado'"];
  const valores = [];

  const tipo = p.get("tipo");
  if (tipo && TIPOS.has(tipo)) {
    condiciones.push("tipo = ?");
    valores.push(tipo);
  }

  // Búsqueda por texto libre.
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  if (q) {
    // Se escapan los comodines para que quien escriba «100%» busque eso
    // literalmente y no todo lo que haya.
    const patron = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    condiciones.push(
      "(nombre LIKE ? ESCAPE '\\' OR descripcion LIKE ? ESCAPE '\\' " +
      "OR categoria LIKE ? ESCAPE '\\' OR colonia LIKE ? ESCAPE '\\')",
    );
    valores.push(patron, patron, patron, patron);
  }

  // Caja envolvente: la vista de mapa pide solo lo que se ve.
  const bbox = p.get("bbox");
  if (bbox) {
    const n = bbox.split(",").map(Number);
    if (n.length === 4 && n.every(Number.isFinite)) {
      const [oeste, sur, este, norte] = n;
      condiciones.push("lat IS NOT NULL AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?");
      valores.push(sur, norte, oeste, este);
    }
  }

  // `soloConMapa` evita que la vista de mapa cuente lugares que no puede pintar.
  if (p.get("con_ubicacion") === "1") condiciones.push("lat IS NOT NULL AND lng IS NOT NULL");

  const sql = `SELECT ${campos(sesion)} FROM lugares
               WHERE ${condiciones.join(" AND ")}
               ORDER BY creado_en DESC
               LIMIT ${LIMITE}`;

  const { results } = await env.morelia.prepare(sql).bind(...valores).all();
  return Response.json({
    lugares: results ?? [],
    total: results?.length ?? 0,
    sesion,                    // el cliente lo usa para pintar el candado
  });
}

async function verUno(request, env, id) {
  const sesion = await haySesion(request, env);
  const fila = await env.morelia.prepare(
    `SELECT ${campos(sesion)} FROM lugares WHERE id = ? AND estado = 'publicado'`,
  ).bind(id).first();
  return fila
    ? Response.json({ lugar: fila, sesion })
    : Response.json({ error: "no encontrado" }, { status: 404 });
}

async function crear(request, env) {
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  if (!usuario) return Response.json({ error: "necesitas iniciar sesión" }, { status: 401 });

  const cuerpo = await request.json().catch(() => null);
  const error = validar(cuerpo);
  if (error) return Response.json({ error }, { status: 400 });

  const id = nuevoId();
  await env.morelia.prepare(
    `INSERT INTO lugares
       (id, tipo, nombre, descripcion, categoria, direccion, colonia, lat, lng,
        telefono, whatsapp, sitio_web, horario, inicia_en, termina_en, creado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id,
    cuerpo.tipo,
    texto(cuerpo.nombre, 120),
    texto(cuerpo.descripcion, 600),
    texto(cuerpo.categoria, 60),
    texto(cuerpo.direccion, 200),
    texto(cuerpo.colonia, 80),
    numero(cuerpo.lat), numero(cuerpo.lng),
    texto(cuerpo.telefono, 25),
    texto(cuerpo.whatsapp, 25),
    texto(cuerpo.sitio_web, 200),
    texto(cuerpo.horario, 120),
    texto(cuerpo.inicia_en, 25),
    texto(cuerpo.termina_en, 25),
    usuario.id,
  ).run();

  const lugar = await env.morelia.prepare(`SELECT ${CAMPOS_COMPLETOS} FROM lugares WHERE id = ?`)
    .bind(id).first();
  return Response.json({ lugar }, { status: 201 });
}

function validar(c) {
  if (!c || typeof c !== "object") return "cuerpo no válido";
  if (!TIPOS.has(c.tipo)) return "tipo debe ser negocio, servicio o evento";
  if (typeof c.nombre !== "string" || !c.nombre.trim()) return "el nombre es obligatorio";
  if (c.nombre.length > 120) return "el nombre es demasiado largo";

  const tieneLat = c.lat !== undefined && c.lat !== null && c.lat !== "";
  const tieneLng = c.lng !== undefined && c.lng !== null && c.lng !== "";
  if (tieneLat !== tieneLng) return "la ubicación necesita latitud y longitud";
  if (tieneLat) {
    const la = Number(c.lat), ln = Number(c.lng);
    if (!Number.isFinite(la) || la < -90 || la > 90)   return "latitud fuera de rango";
    if (!Number.isFinite(ln) || ln < -180 || ln > 180) return "longitud fuera de rango";
  }

  if (c.tipo === "evento" && !c.inicia_en) return "un evento necesita fecha de inicio";
  if (c.sitio_web && !/^https?:\/\//i.test(c.sitio_web)) return "el sitio web debe empezar por http:// o https://";
  return null;
}

const texto  = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
