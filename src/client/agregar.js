import L from "leaflet";

const q = (s) => document.querySelector(s);
const CENTRO = [19.7455, -101.2560];

let mapa, marcador;
let editandoId = null;   // null = alta, id = edición

function iniciarMapa() {
  mapa = L.map(q("[data-mapa-picker]"), { center: CENTRO, zoom: 14 });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  mapa.on("click", (e) => colocar(e.latlng.lat, e.latlng.lng));
  setTimeout(() => mapa.invalidateSize(), 60);
}

function colocar(lat, lng) {
  const icono = L.divIcon({
    className: "marcador",
    iconSize: [26, 34], iconAnchor: [13, 34],
    html: '<svg viewBox="0 0 26 34" width="26" height="34" aria-hidden="true">' +
          '<path d="M13 33C13 33 24 21.5 24 13A11 11 0 1 0 2 13c0 8.5 11 20 11 20Z" ' +
          'fill="#E3A0A8" stroke="#12100F" stroke-width="1.5"/>' +
          '<circle cx="13" cy="13" r="4" fill="#12100F" opacity=".8"/></svg>',
  });

  if (marcador) marcador.setLatLng([lat, lng]);
  else marcador = L.marker([lat, lng], { icon: icono, draggable: true }).addTo(mapa);

  marcador.off("dragend").on("dragend", () => {
    const p = marcador.getLatLng();
    guardarCoords(p.lat, p.lng);
  });

  guardarCoords(lat, lng);
}

function guardarCoords(lat, lng) {
  q('[name="lat"]').value = lat.toFixed(6);
  q('[name="lng"]').value = lng.toFixed(6);
  q("[data-coords]").textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  q("[data-limpiar]").hidden = false;
}

function limpiarCoords() {
  if (marcador) { marcador.remove(); marcador = null; }
  q('[name="lat"]').value = "";
  q('[name="lng"]').value = "";
  q("[data-coords]").textContent = "Sin ubicación";
  q("[data-limpiar]").hidden = true;
}


/* ------------------------------------------------- editor de catálogo --- */

/** El editor mantiene el estado en el DOM y lo lee al enviar: sin estado
 *  paralelo que pueda desincronizarse de lo que la persona ve. */
function filaItem(item = {}) {
  const li = document.createElement("li");
  li.className = "item-edit";
  li.innerHTML = `
    <input class="acceso__input" data-i-nombre placeholder="Nombre del ítem" maxlength="120" />
    <input class="acceso__input item-edit__precio" data-i-precio placeholder="Precio" inputmode="decimal" />
    <input class="acceso__input" data-i-unidad placeholder="Unidad (por hora…)" maxlength="30" />
    <label class="item-edit__desde"><input type="checkbox" data-i-desde /> desde</label>
    <button class="btn btn--ghost item-edit__quitar" type="button" aria-label="Quitar ítem">×</button>`;
  li.querySelector("[data-i-nombre]").value = item.nombre ?? "";
  li.querySelector("[data-i-precio]").value =
    item.precio_centavos != null ? (item.precio_centavos / 100).toString() : "";
  li.querySelector("[data-i-unidad]").value = item.unidad ?? "";
  li.querySelector("[data-i-desde]").checked = Boolean(item.desde);
  li.querySelector(".item-edit__quitar").addEventListener("click", () => li.remove());
  return li;
}

function bloqueSeccion(sec = {}) {
  const div = document.createElement("div");
  div.className = "seccion-edit";
  div.innerHTML = `
    <div class="seccion-edit__cab">
      <input class="acceso__input" data-s-nombre placeholder="Nombre de la sección" maxlength="80" />
      <button class="btn btn--ghost" type="button" data-quitar-seccion aria-label="Quitar sección">×</button>
    </div>
    <ul class="items-edit" data-items></ul>
    <button class="btn btn--ghost" type="button" data-add-item>+ Agregar ítem</button>`;
  div.querySelector("[data-s-nombre]").value = sec.nombre ?? "";
  const ul = div.querySelector("[data-items]");
  for (const it of sec.items ?? []) ul.append(filaItem(it));
  if (!(sec.items ?? []).length) ul.append(filaItem());

  div.querySelector("[data-add-item]").addEventListener("click", () => ul.append(filaItem()));
  div.querySelector("[data-quitar-seccion]").addEventListener("click", () => div.remove());
  return div;
}

function leerCatalogo() {
  return [...document.querySelectorAll(".seccion-edit")].map((div) => ({
    nombre: div.querySelector("[data-s-nombre]").value.trim(),
    items: [...div.querySelectorAll(".item-edit")].map((li) => ({
      nombre: li.querySelector("[data-i-nombre]").value.trim(),
      precio: li.querySelector("[data-i-precio]").value.trim(),
      unidad: li.querySelector("[data-i-unidad]").value.trim(),
      desde: li.querySelector("[data-i-desde]").checked,
    })).filter((i) => i.nombre),
  })).filter((s) => s.nombre);
}

async function guardarCatalogo(lugarId) {
  const secciones = leerCatalogo();
  if (!secciones.length) return;
  await fetch(`/api/lugares/${lugarId}/catalogo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secciones }),
  });
}

async function enviar(e) {
  e.preventDefault();
  const form = e.target;
  const boton = q("[data-submit]");
  const error = q("[data-error]");
  const ok = q("[data-ok]");
  error.hidden = true; ok.hidden = true;

  const datos = Object.fromEntries(new FormData(form));
  if (!datos.nombre?.trim()) {
    error.textContent = "El nombre es obligatorio.";
    error.hidden = false;
    form.nombre.focus();
    return;
  }

  const editando = Boolean(editandoId);
  boton.disabled = true;
  boton.textContent = editando ? "Guardando…" : "Publicando…";
  try {
    const resp = await fetch(editando ? `/api/lugares/${editandoId}` : "/api/lugares", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = await resp.json().catch(() => ({}));

    if (resp.status === 401) {
      error.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
      error.hidden = false;
    } else if (resp.status === 403) {
      error.textContent = "Solo quien lo publicó puede editarlo.";
      error.hidden = false;
    } else if (!resp.ok) {
      error.textContent = cuerpo.error ?? "No pudimos guardar el lugar.";
      error.hidden = false;
    } else {
      // El catálogo se guarda aparte, ya con el id: en un alta no existe hasta
      // que el lugar se crea.
      const id = editandoId ?? cuerpo.lugar?.id;
      if (id) await guardarCatalogo(id);

      ok.textContent = editando
        ? "Guardado."
        : "Publicado. Ya aparece en Explorar.";
      ok.hidden = false;

      if (!editando) {
        form.reset();
        limpiarCoords();
        q("[data-solo-evento]").hidden = true;
        q("[data-secciones]").replaceChildren();
      }
    }
  } catch {
    error.textContent = "No hay conexión. Inténtalo de nuevo.";
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = editando ? "Guardar cambios" : "Publicar lugar";
  }
}

/** Rellena el formulario con un lugar existente. */
async function cargarParaEditar(id) {
  const [rLugar, rCat] = await Promise.all([
    fetch(`/api/lugares/${id}`),
    fetch(`/api/lugares/${id}/catalogo`),
  ]);
  if (!rLugar.ok) return false;

  const { lugar, puedo_editar } = await rLugar.json();
  // No es tuyo: no se rellena nada. El servidor lo rechazaría igual, pero
  // ofrecer un formulario que va a fallar es peor que no ofrecerlo.
  if (!puedo_editar) return false;
  const { secciones = [] } = await rCat.json().catch(() => ({}));

  const form = q("[data-form]");
  for (const campo of ["nombre", "categoria", "descripcion", "direccion", "colonia",
                       "telefono", "whatsapp", "horario", "sitio_web",
                       "inicia_en", "termina_en"]) {
    if (form[campo] && lugar[campo] != null) form[campo].value = lugar[campo];
  }

  const radio = form.querySelector(`[name="tipo"][value="${lugar.tipo}"]`);
  if (radio) { radio.checked = true; q("[data-solo-evento]").hidden = lugar.tipo !== "evento"; }

  if (lugar.lat != null && lugar.lng != null) {
    colocar(lugar.lat, lugar.lng);
    mapa.setView([lugar.lat, lugar.lng], 16);
  }

  const cont = q("[data-secciones]");
  cont.replaceChildren();
  for (const sec of secciones) cont.append(bloqueSeccion(sec));

  q("[data-titulo]").textContent = "Editar lugar";
  q("[data-lede]").textContent = "Cambia lo que necesites. Solo tú puedes editarlo.";
  q("[data-submit]").textContent = "Guardar cambios";
  return true;
}

async function arranque() {
  // El formulario solo aparece con sesión: publicar la requiere.
  let haySesion = false;
  try {
    const r = await fetch("/api/auth/yo");
    haySesion = (await r.json())?.sesion === true;
  } catch { /* sin red: se trata como sin sesión */ }

  q("[data-necesita-sesion]").hidden = haySesion;
  q("[data-form]").hidden = !haySesion;
  if (!haySesion) return;

  iniciarMapa();
  q("[data-limpiar]").addEventListener("click", limpiarCoords);
  q("[data-form]").addEventListener("submit", enviar);
  q("[data-add-seccion]").addEventListener("click", () => {
    q("[data-secciones]").append(bloqueSeccion());
  });

  // ?id=… entra en modo edición.
  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    editandoId = id;
    const ok = await cargarParaEditar(id);
    if (!ok) {
      editandoId = null;
      const e = q("[data-error]");
      e.textContent = "No encontramos ese lugar, o no lo publicaste tú.";
      e.hidden = false;
    }
  }

  // Las fechas solo tienen sentido en eventos.
  for (const r of document.querySelectorAll('[name="tipo"]')) {
    r.addEventListener("change", () => {
      q("[data-solo-evento]").hidden = r.value !== "evento" || !r.checked;
    });
  }
}

if (document.readyState !== "loading") void arranque();
else document.addEventListener("DOMContentLoaded", () => void arranque(), { once: true });
