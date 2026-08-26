-- Atarax — catálogo por secciones y eventos con fechas estructuradas.

-- Un servicio o negocio agrupa su oferta en secciones ("Cortes", "Instalación")
-- y cada sección lista ítems con precio. Es el modelo de carta de restaurante,
-- que es el que la gente ya sabe leer.
CREATE TABLE IF NOT EXISTS catalogo_secciones (
  id          TEXT PRIMARY KEY,
  lugar_id    TEXT NOT NULL REFERENCES lugares(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_secciones_lugar ON catalogo_secciones(lugar_id, orden);

CREATE TABLE IF NOT EXISTS catalogo_items (
  id          TEXT PRIMARY KEY,
  seccion_id  TEXT NOT NULL REFERENCES catalogo_secciones(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  -- El precio va en centavos enteros: los flotantes redondean mal el dinero.
  precio_centavos INTEGER,
  moneda      TEXT NOT NULL DEFAULT 'MXN',
  -- Muchos servicios cotizan «desde»: el precio final depende del trabajo.
  desde       INTEGER NOT NULL DEFAULT 0,
  unidad      TEXT,                        -- 'por hora', 'por m²', 'por pieza'
  orden       INTEGER NOT NULL DEFAULT 0,
  disponible  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_items_seccion ON catalogo_items(seccion_id, orden);

-- Eventos: los campos que faltaban para generar un .ics correcto.
ALTER TABLE lugares ADD COLUMN todo_el_dia INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lugares ADD COLUMN zona_horaria TEXT NOT NULL DEFAULT 'America/Mexico_City';
-- Repetición en formato RRULE de RFC 5545: 'FREQ=WEEKLY;BYDAY=TU,TH'.
-- Guardar el estándar evita inventar un formato propio que luego haya que
-- traducir a iCalendar de todas formas.
ALTER TABLE lugares ADD COLUMN recurrencia TEXT;
