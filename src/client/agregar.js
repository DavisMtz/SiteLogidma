import L from "leaflet";

const q = (s) => document.querySelector(s);
const CENTRO = [19.7455, -101.2560];

let mapa, marcador;

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

  boton.disabled = true;
  boton.textContent = "Publicando…";
  try {
    const resp = await fetch("/api/lugares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
    });
    const cuerpo = await resp.json().catch(() => ({}));

    if (resp.status === 401) {
      error.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
      error.hidden = false;
    } else if (!resp.ok) {
      error.textContent = cuerpo.error ?? "No pudimos publicar el lugar.";
      error.hidden = false;
    } else {
      ok.textContent = "Publicado. Ya aparece en Explorar.";
      ok.hidden = false;
      form.reset();
      limpiarCoords();
      q("[data-solo-evento]").hidden = true;
    }
  } catch {
    error.textContent = "No hay conexión. Inténtalo de nuevo.";
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = "Publicar lugar";
  }
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

  // Las fechas solo tienen sentido en eventos.
  for (const r of document.querySelectorAll('[name="tipo"]')) {
    r.addEventListener("change", () => {
      q("[data-solo-evento]").hidden = r.value !== "evento" || !r.checked;
    });
  }
}

if (document.readyState !== "loading") void arranque();
else document.addEventListener("DOMContentLoaded", () => void arranque(), { once: true });
