import L from "leaflet";
import { gsap } from "gsap";

const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];

// Centro aproximado de Villas del Pedregal, Morelia.
const CENTRO = [19.7455, -101.2560];
const ZOOM = 14;

const COLOR = { negocio: "#E3A0A8", servicio: "#9C8FC7", evento: "#D9B36C" };

const estado = {
  tipo: "",
  q: "",
  modo: "lista",
  lugares: [],
  mapa: null,
  capaMarcadores: null,
};

/* ---------------------------------------------------------------- datos -- */

async function cargar() {
  const p = new URLSearchParams();
  if (estado.tipo) p.set("tipo", estado.tipo);
  if (estado.q) p.set("q", estado.q);

  q("[data-estado]").textContent = "Buscando…";
  try {
    const resp = await fetch(`/api/lugares?${p}`);
    const datos = await resp.json();
    estado.lugares = datos.lugares ?? [];
  } catch {
    estado.lugares = [];
    q("[data-estado]").textContent = "No pudimos cargar los lugares.";
    return;
  }
  pintar();
}

/* -------------------------------------------------------------- pintado -- */

function pintar() {
  const n = estado.lugares.length;
  const conUbicacion = estado.lugares.filter((l) => l.lat != null && l.lng != null).length;

  q("[data-estado]").textContent = n === 0
    ? ""
    : `${n} ${n === 1 ? "lugar" : "lugares"}` +
      (estado.modo === "mapa" && conUbicacion < n
        ? ` · ${n - conUbicacion} sin ubicación, no aparecen en el mapa`
        : "");

  pintarLista();
  if (estado.modo === "mapa") pintarMapa();
}

function pintarLista() {
  const ul = q("[data-lista]");
  ul.replaceChildren();
  q("[data-vacio]").hidden = estado.lugares.length > 0;

  for (const l of estado.lugares) ul.append(tarjeta(l));

  if (estado.lugares.length && !reducido()) {
    gsap.from(ul.children, {
      y: 14, autoAlpha: 0, duration: 0.5, ease: "power2.out",
      stagger: { each: 0.035, ease: "power2.out" },
    });
  }
}

/** Todo el contenido va por textContent: los datos los escriben usuarios. */
function tarjeta(l) {
  const li = document.createElement("li");
  li.className = "lugar";
  li.dataset.id = l.id;

  const cab = document.createElement("div");
  cab.className = "lugar__cab";

  const punto = document.createElement("span");
  punto.className = "lugar__punto";
  punto.style.background = COLOR[l.tipo] ?? "var(--text-faint)";
  cab.append(punto);

  const tipo = document.createElement("span");
  tipo.className = "lugar__tipo";
  tipo.textContent = l.tipo;
  cab.append(tipo);

  if (l.categoria) {
    const cat = document.createElement("span");
    cat.className = "lugar__cat";
    cat.textContent = l.categoria;
    cab.append(cat);
  }
  li.append(cab);

  const h = document.createElement("h3");
  h.className = "lugar__nombre";
  h.textContent = l.nombre;
  li.append(h);

  if (l.descripcion) {
    const p = document.createElement("p");
    p.className = "lugar__desc";
    p.textContent = l.descripcion;
    li.append(p);
  }

  const meta = document.createElement("dl");
  meta.className = "lugar__meta";
  const dato = (etiqueta, valor) => {
    if (!valor) return;
    const dt = document.createElement("dt"); dt.textContent = etiqueta;
    const dd = document.createElement("dd"); dd.textContent = valor;
    meta.append(dt, dd);
  };
  dato("Dónde", [l.direccion, l.colonia].filter(Boolean).join(", "));
  dato("Horario", l.horario);
  dato("Cuándo", l.inicia_en);
  dato("Teléfono", l.telefono);
  if (meta.children.length) li.append(meta);

  if (l.lat != null && l.lng != null) {
    const ver = document.createElement("button");
    ver.className = "lugar__ver";
    ver.type = "button";
    ver.textContent = "Ver en el mapa";
    ver.addEventListener("click", () => {
      cambiarModo("mapa");
      // El mapa puede no existir aún la primera vez.
      setTimeout(() => estado.mapa?.setView([l.lat, l.lng], 17), 60);
    });
    li.append(ver);
  }

  return li;
}

/* ----------------------------------------------------------------- mapa -- */

function iniciarMapa() {
  if (estado.mapa) return;

  estado.mapa = L.map(q("[data-mapa]"), {
    center: CENTRO,
    zoom: ZOOM,
    zoomControl: true,
    attributionControl: true,
  });

  // OpenStreetMap exige atribución visible. Es condición de uso, no un adorno.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(estado.mapa);

  estado.capaMarcadores = L.layerGroup().addTo(estado.mapa);
}

/** Marcador propio en SVG: evita las imágenes de Leaflet y usa la paleta. */
function icono(tipo) {
  const color = COLOR[tipo] ?? "#A79A91";
  return L.divIcon({
    className: "marcador",
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
    html:
      `<svg viewBox="0 0 26 34" width="26" height="34" aria-hidden="true">` +
      `<path d="M13 33C13 33 24 21.5 24 13A11 11 0 1 0 2 13c0 8.5 11 20 11 20Z" ` +
      `fill="${color}" stroke="#12100F" stroke-width="1.5"/>` +
      `<circle cx="13" cy="13" r="4" fill="#12100F" opacity=".8"/></svg>`,
  });
}

function pintarMapa() {
  iniciarMapa();
  estado.capaMarcadores.clearLayers();

  const conUbicacion = estado.lugares.filter((l) => l.lat != null && l.lng != null);
  const puntos = [];

  for (const l of conUbicacion) {
    const m = L.marker([l.lat, l.lng], { icon: icono(l.tipo), title: l.nombre });

    // El popup se construye con DOM, no con HTML interpolado: el nombre y la
    // descripción los escriben usuarios.
    const caja = document.createElement("div");
    caja.className = "popup";
    const t = document.createElement("strong");
    t.textContent = l.nombre;
    caja.append(t);
    if (l.categoria) {
      const c = document.createElement("span");
      c.className = "popup__cat";
      c.textContent = l.categoria;
      caja.append(c);
    }
    const d = [l.direccion, l.colonia].filter(Boolean).join(", ");
    if (d) {
      const p = document.createElement("p");
      p.textContent = d;
      caja.append(p);
    }
    m.bindPopup(caja);

    m.addTo(estado.capaMarcadores);
    puntos.push([l.lat, l.lng]);
  }

  // Encuadrar lo que hay, sin alejarse tanto que se pierda el contexto.
  if (puntos.length > 1) {
    estado.mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 });
  } else if (puntos.length === 1) {
    estado.mapa.setView(puntos[0], 16);
  }

  // Leaflet mide mal si el contenedor estaba oculto al crearse.
  setTimeout(() => estado.mapa.invalidateSize(), 60);
}

/* --------------------------------------------------------------- modos --- */

function cambiarModo(modo) {
  estado.modo = modo;

  for (const b of qa("[data-modo]")) {
    const activo = b.dataset.modo === modo;
    b.classList.toggle("modo--activo", activo);
    b.setAttribute("aria-pressed", String(activo));
  }
  for (const v of qa("[data-vista]")) v.hidden = v.dataset.vista !== modo;

  // El modo va en la URL: así se puede compartir un enlace al mapa.
  const u = new URL(location.href);
  u.searchParams.set("modo", modo);
  history.replaceState(null, "", u);

  if (modo === "mapa") pintarMapa();
  pintar();
}

const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------------------------------------------------- arranque - */

function arranque() {
  const params = new URLSearchParams(location.search);
  estado.q = params.get("q") ?? "";
  estado.tipo = params.get("tipo") ?? "";
  if (estado.q) q("#q").value = estado.q;

  for (const c of qa("[data-tipo]")) {
    c.classList.toggle("chip--activo", c.dataset.tipo === estado.tipo);
    c.addEventListener("click", () => {
      estado.tipo = c.dataset.tipo;
      for (const o of qa("[data-tipo]")) o.classList.toggle("chip--activo", o === c);
      void cargar();
    });
  }

  for (const b of qa("[data-modo]")) {
    b.addEventListener("click", () => cambiarModo(b.dataset.modo));
  }

  let t;
  q("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    // Espera a que deje de teclear: una consulta por pulsación es desperdicio.
    t = setTimeout(() => { estado.q = e.target.value.trim(); void cargar(); }, 280);
  });
  q("[data-buscar]").addEventListener("submit", (e) => e.preventDefault());

  const modoInicial = params.get("modo") === "mapa" ? "mapa" : "lista";
  cambiarModo(modoInicial);
  void cargar();
  void pintarSesion();
}

async function pintarSesion() {
  const enlace = q("[data-auth]");
  if (!enlace) return;
  try {
    const r = await fetch("/api/auth/yo");
    const d = await r.json();
    if (!d?.sesion) return;
    const s = document.createElement("span");
    s.className = "nav__correo";
    s.textContent = d.usuario.nombre || d.usuario.email;
    enlace.replaceWith(s);
  } catch { /* sin red: se queda "Iniciar sesión" */ }
}

if (document.readyState !== "loading") arranque();
else document.addEventListener("DOMContentLoaded", arranque, { once: true });
