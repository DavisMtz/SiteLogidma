const q = (s) => document.querySelector(s);

const TIPO = { negocio: "Negocio", servicio: "Servicio", evento: "Evento" };
const COLOR = { negocio: "#E3A0A8", servicio: "#9C8FC7", evento: "#D9B36C" };

function aviso(sel, texto) {
  const el = q(sel);
  el.textContent = texto;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000);
}

function tarjeta(l, alBorrar, alCambiarEstado) {
  const li = document.createElement("li");
  li.className = "lugar";

  const cab = document.createElement("div");
  cab.className = "lugar__cab";
  const punto = document.createElement("span");
  punto.className = "lugar__punto";
  punto.style.background = COLOR[l.tipo] ?? "var(--text-faint)";
  const tipo = document.createElement("span");
  tipo.className = "lugar__tipo";
  tipo.textContent = TIPO[l.tipo] ?? l.tipo;
  cab.append(punto, tipo);

  if (l.estado === "oculto") {
    const et = document.createElement("span");
    et.className = "etiqueta etiqueta--oculto";
    et.textContent = "Oculto";
    cab.append(et);
  }
  li.append(cab);

  const h = document.createElement("h3");
  h.className = "lugar__nombre";
  const a = document.createElement("a");
  a.className = "lugar__enlace";
  a.href = `/lugar/${l.id}`;
  a.textContent = l.nombre;          // textContent: lo escribe el usuario
  h.append(a);
  li.append(h);

  if (l.secciones) {
    const p = document.createElement("p");
    p.className = "lugar__desc";
    p.textContent = `${l.secciones} ${l.secciones === 1 ? "sección" : "secciones"} en el catálogo`;
    li.append(p);
  }

  const acciones = document.createElement("div");
  acciones.className = "acciones";

  const editar = document.createElement("a");
  editar.className = "btn btn--ghost";
  editar.href = `/agregar?id=${l.id}`;
  editar.textContent = "Editar";
  acciones.append(editar);

  const visibilidad = document.createElement("button");
  visibilidad.className = "btn btn--ghost";
  visibilidad.type = "button";
  visibilidad.textContent = l.estado === "oculto" ? "Publicar" : "Ocultar";
  visibilidad.addEventListener("click", () => alCambiarEstado(l, visibilidad));
  acciones.append(visibilidad);

  const borrar = document.createElement("button");
  borrar.className = "btn btn--peligro";
  borrar.type = "button";
  borrar.textContent = "Borrar";
  borrar.addEventListener("click", () => alBorrar(l, borrar));
  acciones.append(borrar);

  li.append(acciones);
  return li;
}

async function cargar() {
  let datos;
  try {
    const r = await fetch("/api/mis-lugares");
    if (r.status === 401) {
      q("[data-necesita-sesion]").hidden = false;
      return;
    }
    datos = await r.json();
  } catch {
    aviso("[data-error]", "No pudimos cargar tus lugares.");
    return;
  }

  const lista = q("[data-lista]");
  lista.replaceChildren();
  q("[data-vacio]").hidden = datos.total > 0;

  for (const l of datos.lugares) {
    lista.append(tarjeta(l, borrar, cambiarEstado));
  }
}

async function borrar(l, boton) {
  // Borrar es irreversible y arrastra el catálogo: se confirma con el nombre
  // delante para que nadie borre el lugar equivocado de un clic.
  if (!confirm(`¿Borrar «${l.nombre}»?\n\nSe elimina también su catálogo. Esto no se puede deshacer.`)) return;

  boton.disabled = true;
  const r = await fetch(`/api/lugares/${l.id}`, { method: "DELETE" });
  if (r.ok) { aviso("[data-ok]", `«${l.nombre}» se borró.`); await cargar(); }
  else { aviso("[data-error]", "No pudimos borrarlo."); boton.disabled = false; }
}

async function cambiarEstado(l, boton) {
  const nuevo = l.estado === "oculto" ? "publicado" : "oculto";
  boton.disabled = true;
  const r = await fetch(`/api/lugares/${l.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ estado: nuevo }),
  });
  if (r.ok) {
    aviso("[data-ok]", nuevo === "oculto"
      ? `«${l.nombre}» ya no aparece en Explorar.`
      : `«${l.nombre}» vuelve a estar visible.`);
    await cargar();
  } else { aviso("[data-error]", "No pudimos cambiarlo."); boton.disabled = false; }
}

if (document.readyState !== "loading") void cargar();
else document.addEventListener("DOMContentLoaded", () => void cargar(), { once: true });
