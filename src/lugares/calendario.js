/**
 * Generación de iCalendar (RFC 5545) y enlaces de "añadir al calendario".
 *
 * El .ics es el camino universal: lo entienden Apple Calendar, Outlook de
 * escritorio, Thunderbird y el propio Google. Los enlaces directos a Google
 * y Outlook web son un atajo para quien vive en el navegador.
 *
 * México suprimió el horario de verano en 2022, así que America/Mexico_City
 * es UTC-6 todo el año y la conversión es una resta fija.
 */

const OFFSET_MX = -6 * 60; // minutos

/** RFC 5545 §3.3.11: en valores TEXT hay que escapar \ ; , y los saltos. */
function escapar(texto) {
  return String(texto ?? "")
    .replace(/\\/g, "\\\\")
    // Ojo: en JS "\;" no es un escape válido y colapsa a ";", dejando el
    // punto y coma sin escapar. Hace falta la doble barra.
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: ninguna línea pasa de 75 octetos; las largas se parten y
 * continúan con un espacio inicial. Se mide en BYTES, no en caracteres: una
 * «ñ» ocupa dos, y partir por caracteres genera archivos que algunos
 * calendarios rechazan.
 */
function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;

  const trozos = [];
  let inicio = 0;
  while (inicio < bytes.length) {
    // 75 el primero, 74 los siguientes (el espacio de continuación cuenta).
    let fin = Math.min(inicio + (trozos.length === 0 ? 75 : 74), bytes.length);
    // No cortar a mitad de un carácter multibyte.
    while (fin > inicio && fin < bytes.length && (bytes[fin] & 0xc0) === 0x80) fin--;
    trozos.push(new TextDecoder().decode(bytes.slice(inicio, fin)));
    inicio = fin;
  }
  return trozos.join("\r\n ");
}

/** Instante actual, ya en UTC: no pasa por el desplazamiento de Morelia. */
function ahoraUtc() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fecha local de Morelia → UTC en formato básico: 20260915T190000Z */
function aUtc(iso) {
  const limpio = String(iso).trim().replace(" ", "T");
  const m = limpio.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, a, mes, d, h = "00", min = "00"] = m;
  const utc = Date.UTC(+a, +mes - 1, +d, +h, +min) - OFFSET_MX * 60 * 1000;
  return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Solo la fecha, para eventos de día completo: 20260915 */
function soloFecha(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Añade horas a una fecha ISO local. */
function mas(iso, horas) {
  const limpio = String(iso).trim().replace(" ", "T");
  const d = new Date(limpio);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(d.getHours() + horas);
  return d.toISOString().slice(0, 16);
}

export function generarIcs(lugar, origen) {
  if (!lugar.inicia_en) return null;

  const todoElDia = Boolean(lugar.todo_el_dia);
  // Sin hora de fin, dos horas es la convención razonable para un evento.
  const fin = lugar.termina_en || mas(lugar.inicia_en, 2);

  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atarax//Directorio local//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${lugar.id}@atarax.logidma.com`,
    `DTSTAMP:${ahoraUtc()}`,
  ];

  if (todoElDia) {
    lineas.push(`DTSTART;VALUE=DATE:${soloFecha(lugar.inicia_en)}`);
    if (fin) lineas.push(`DTEND;VALUE=DATE:${soloFecha(fin)}`);
  } else {
    lineas.push(`DTSTART:${aUtc(lugar.inicia_en)}`);
    if (fin) lineas.push(`DTEND:${aUtc(fin)}`);
  }

  if (lugar.recurrencia) lineas.push(`RRULE:${lugar.recurrencia}`);

  lineas.push(`SUMMARY:${escapar(lugar.nombre)}`);
  if (lugar.descripcion) lineas.push(`DESCRIPTION:${escapar(lugar.descripcion)}`);

  const donde = [lugar.direccion, lugar.colonia, "Morelia, Michoacán"].filter(Boolean).join(", ");
  if (donde) lineas.push(`LOCATION:${escapar(donde)}`);

  if (lugar.lat != null && lugar.lng != null) lineas.push(`GEO:${lugar.lat};${lugar.lng}`);
  if (origen) lineas.push(`URL:${origen}/lugar/${lugar.id}`);

  lineas.push("END:VEVENT", "END:VCALENDAR");

  // CRLF, no LF: la especificación lo exige y algunos clientes son estrictos.
  return lineas.map(plegar).join("\r\n") + "\r\n";
}

/** Enlace de plantilla de Google Calendar. */
export function enlaceGoogle(lugar) {
  if (!lugar.inicia_en) return null;
  const fin = lugar.termina_en || mas(lugar.inicia_en, 2);
  const rango = lugar.todo_el_dia
    ? `${soloFecha(lugar.inicia_en)}/${soloFecha(fin)}`
    : `${aUtc(lugar.inicia_en)}/${aUtc(fin)}`;

  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: lugar.nombre,
    dates: rango,
  });
  if (lugar.descripcion) p.set("details", lugar.descripcion);
  const donde = [lugar.direccion, lugar.colonia, "Morelia, Michoacán"].filter(Boolean).join(", ");
  if (donde) p.set("location", donde);
  if (lugar.recurrencia) p.set("recur", `RRULE:${lugar.recurrencia}`);

  return `https://calendar.google.com/calendar/render?${p}`;
}
