/**
 * Lugares: negocios, servicios y eventos.
 *
 * Lectura pública (buscar no requiere cuenta). Escritura con sesión.
 */

import { nuevoId, ahora } from "../auth/crypto.js";
import { usuarioDeSesion } from "../auth/sesiones.js";
import { COOKIE_SESION, leerCookie } from "../auth/cookies.js";
import { generarIcs } from "./calendario.js";
import { renderFicha } from "./ficha.js";
import { origenCanonico } from "../auth/origen.js";
import { puedeEditar, respuestaDenegada, PERMITIDO } from "./permisos.js";

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

  if (ruta === "/api/mis-lugares") return await mios(request, env);

  const detalle = ruta.match(/^\/api\/lugares\/([A-Za-z0-9-]{36})$/);
  if (detalle) {
    if (request.method === "GET")    return await verUno(request, env, detalle[1]);
    if (request.method === "PATCH")  return await editar(request, env, detalle[1]);
    if (request.method === "DELETE") return await borrar(request, env, detalle[1]);
    return Response.json({ error: "método no permitido" }, { status: 405 });
  }

  const cat = ruta.match(/^\/api\/lugares\/([A-Za-z0-9-]{36})\/catalogo$/);
  if (cat) {
    if (request.method === "GET")  return Response.json({ secciones: await catalogoDe(env, cat[1]) });
    if (request.method === "POST") return await guardarCatalogo(request, env, cat[1]);
    return Response.json({ error: "método no permitido" }, { status: 405 });
  }

  const ics = ruta.match(/^\/api\/lugares\/([A-Za-z0-9-]{36})\/ics$/);
  if (ics) return await descargarIcs(env, ics[1], origenCanonico(env, url));

  const ficha = ruta.match(/^\/lugar\/([A-Za-z0-9-]{36})$/);
  if (ficha) return await paginaFicha(request, env, ficha[1], origenCanonico(env, url));

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
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  const sesion = Boolean(usuario);

  const fila = await env.morelia.prepare(
    `SELECT ${campos(sesion)}, creado_por FROM lugares WHERE id = ? AND estado = 'publicado'`,
  ).bind(id).first();

  if (!fila) return Response.json({ error: "no encontrado" }, { status: 404 });

  // El cliente necesita saber si puede editar ANTES de pintar un formulario:
  // sin esto ofrecería editar a cualquiera y el rechazo llegaría al guardar,
  // que es tarde y confunde. La decisión la sigue tomando el servidor.
  const puedo_editar = Boolean(usuario && fila.creado_por && fila.creado_por === usuario.id);
  delete fila.creado_por;   // dato interno: no sale al cliente

  return Response.json({ lugar: fila, sesion, puedo_editar });
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


/* ------------------------------------------------------- catálogo ------- */

/** Secciones con sus ítems, en dos consultas en vez de N+1. */
async function catalogoDe(env, lugarId) {
  const { results: secciones } = await env.morelia.prepare(
    "SELECT id, nombre, descripcion FROM catalogo_secciones WHERE lugar_id = ? ORDER BY orden, creado_en",
  ).bind(lugarId).all();

  if (!secciones?.length) return [];

  const marcadores = secciones.map(() => "?").join(",");
  const { results: items } = await env.morelia.prepare(
    `SELECT id, seccion_id, nombre, descripcion, precio_centavos, moneda, desde, unidad, disponible
       FROM catalogo_items WHERE seccion_id IN (${marcadores}) ORDER BY orden, rowid`,
  ).bind(...secciones.map((s) => s.id)).all();

  const porSeccion = new Map(secciones.map((s) => [s.id, []]));
  for (const i of items ?? []) porSeccion.get(i.seccion_id)?.push(i);

  return secciones.map((s) => ({ ...s, items: porSeccion.get(s.id) ?? [] }));
}

/* ---------------------------------------------------------- ficha ------- */

async function paginaFicha(request, env, id, origen) {
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  const sesion = Boolean(usuario);
  const lugar = await env.morelia.prepare(
    `SELECT ${campos(sesion)}, todo_el_dia, recurrencia, creado_por FROM lugares
      WHERE id = ? AND estado = 'publicado'`,
  ).bind(id).first();

  if (!lugar) {
    return new Response("Lugar no encontrado", {
      status: 404, headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const esMio = Boolean(usuario && lugar.creado_por && lugar.creado_por === usuario.id);
  const secciones = await catalogoDe(env, id);
  return new Response(renderFicha(lugar, secciones, sesion, origen, esMio), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/* ------------------------------------------------------------ ics ------- */

async function descargarIcs(env, id, origen) {
  // El .ics necesita la dirección exacta para ser útil en el calendario, así
  // que se lee completo; es un evento público y su sitio es parte del evento.
  const l = await env.morelia.prepare(
    `SELECT id, tipo, nombre, descripcion, direccion, colonia, lat, lng,
            inicia_en, termina_en, todo_el_dia, recurrencia
       FROM lugares WHERE id = ? AND estado = 'publicado' AND tipo = 'evento'`,
  ).bind(id).first();

  if (!l?.inicia_en) return Response.json({ error: "no es un evento con fecha" }, { status: 404 });

  const nombre = l.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return new Response(generarIcs(l, origen), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre || "evento"}.ics"`,
    },
  });
}

/**
 * Reemplaza el catálogo completo de un lugar. Solo su autor.
 *
 * Se sustituye entero en vez de parchear ítem por ítem: el editor manda el
 * estado final y así no hay que sincronizar altas, bajas y reordenamientos.
 * El borrado en cascada limpia los ítems de las secciones eliminadas.
 */
async function guardarCatalogo(request, env, lugarId) {
  const { veredicto } = await puedeEditar(request, env, lugarId);
  if (veredicto !== PERMITIDO) return respuestaDenegada(veredicto);

  const cuerpo = await request.json().catch(() => null);
  const secciones = Array.isArray(cuerpo?.secciones) ? cuerpo.secciones : null;
  if (!secciones) return Response.json({ error: "se esperaba una lista de secciones" }, { status: 400 });
  if (secciones.length > 30) return Response.json({ error: "demasiadas secciones" }, { status: 400 });

  const sentencias = [
    env.morelia.prepare("DELETE FROM catalogo_secciones WHERE lugar_id = ?").bind(lugarId),
  ];

  secciones.forEach((sec, iSec) => {
    if (typeof sec?.nombre !== "string" || !sec.nombre.trim()) return;
    const secId = nuevoId();
    sentencias.push(env.morelia.prepare(
      "INSERT INTO catalogo_secciones (id, lugar_id, nombre, descripcion, orden) VALUES (?,?,?,?,?)",
    ).bind(secId, lugarId, sec.nombre.trim().slice(0, 80),
           texto(sec.descripcion, 300), iSec));

    const items = Array.isArray(sec.items) ? sec.items.slice(0, 100) : [];
    items.forEach((it, iIt) => {
      if (typeof it?.nombre !== "string" || !it.nombre.trim()) return;
      sentencias.push(env.morelia.prepare(
        `INSERT INTO catalogo_items
           (id, seccion_id, nombre, descripcion, precio_centavos, moneda, desde, unidad, orden, disponible)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuevoId(), secId, it.nombre.trim().slice(0, 120), texto(it.descripcion, 400),
        centavos(it.precio), (it.moneda || "MXN").slice(0, 3),
        it.desde ? 1 : 0, texto(it.unidad, 30), iIt, it.disponible === false ? 0 : 1,
      ));
    });
  });

  // batch() es atómico: o entra el catálogo entero, o no entra nada. Sin eso,
  // un fallo a mitad dejaría el lugar sin catálogo tras haber borrado el viejo.
  await env.morelia.batch(sentencias);

  return Response.json({ secciones: await catalogoDe(env, lugarId) });
}

/** Los precios se guardan en centavos: los flotantes redondean mal el dinero. */
function centavos(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}


/* ------------------------------------------------- edición y permisos --- */

/** Lugares del usuario, incluidos los ocultos: son suyos y debe verlos. */
async function mios(request, env) {
  const usuario = await usuarioDeSesion(env.morelia, leerCookie(request, COOKIE_SESION));
  if (!usuario) return Response.json({ error: "necesitas iniciar sesión" }, { status: 401 });

  const { results } = await env.morelia.prepare(
    `SELECT ${CAMPOS_COMPLETOS}, estado,
            (SELECT COUNT(*) FROM catalogo_secciones s WHERE s.lugar_id = lugares.id) AS secciones
       FROM lugares WHERE creado_por = ? ORDER BY creado_en DESC`,
  ).bind(usuario.id).all();

  return Response.json({ lugares: results ?? [], total: results?.length ?? 0 });
}

/** Campos que el dueño puede cambiar. La lista es blanca a propósito: así
 *  añadir una columna al esquema no la vuelve editable por accidente. */
const EDITABLES = {
  nombre:      (v) => texto(v, 120),
  descripcion: (v) => texto(v, 600),
  categoria:   (v) => texto(v, 60),
  direccion:   (v) => texto(v, 200),
  colonia:     (v) => texto(v, 80),
  telefono:    (v) => texto(v, 25),
  whatsapp:    (v) => texto(v, 25),
  sitio_web:   (v) => texto(v, 200),
  horario:     (v) => texto(v, 120),
  inicia_en:   (v) => texto(v, 25),
  termina_en:  (v) => texto(v, 25),
  recurrencia: (v) => texto(v, 120),
  lat:         (v) => numero(v),
  lng:         (v) => numero(v),
  todo_el_dia: (v) => (v ? 1 : 0),
  estado:      (v) => (v === "oculto" ? "oculto" : "publicado"),
};

async function editar(request, env, id) {
  const { veredicto, lugar } = await puedeEditar(request, env, id);
  if (veredicto !== PERMITIDO) return respuestaDenegada(veredicto);

  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") {
    return Response.json({ error: "cuerpo no válido" }, { status: 400 });
  }

  // Se valida contra la mezcla de la fila COMPLETA y lo enviado: una edición
  // parcial no puede dejar el registro en un estado que la creación habría
  // rechazado, pero tampoco debe fallar por campos que no se están tocando —
  // editar el nombre de un evento no puede exigir reenviar su fecha.
  const actual = await env.morelia.prepare(
    `SELECT ${CAMPOS_COMPLETOS} FROM lugares WHERE id = ?`,
  ).bind(id).first();
  const propuesto = { ...actual, tipo: lugar.tipo, ...cuerpo };
  const error = validar(propuesto);
  if (error) return Response.json({ error }, { status: 400 });

  const sets = [], valores = [];
  for (const [campo, limpiar] of Object.entries(EDITABLES)) {
    if (!(campo in cuerpo)) continue;          // solo lo que se envía
    sets.push(`${campo} = ?`);
    valores.push(limpiar(cuerpo[campo]));
  }
  if (!sets.length) return Response.json({ error: "nada que cambiar" }, { status: 400 });

  sets.push("actualizado_en = datetime('now')");
  valores.push(id);

  await env.morelia.prepare(`UPDATE lugares SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...valores).run();

  const actualizado = await env.morelia.prepare(`SELECT ${CAMPOS_COMPLETOS}, estado FROM lugares WHERE id = ?`)
    .bind(id).first();
  return Response.json({ lugar: actualizado });
}

async function borrar(request, env, id) {
  const { veredicto } = await puedeEditar(request, env, id);
  if (veredicto !== PERMITIDO) return respuestaDenegada(veredicto);

  // El catálogo cae con el lugar por ON DELETE CASCADE.
  await env.morelia.prepare("DELETE FROM lugares WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
