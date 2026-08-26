-- Atarax — lugares: negocios, servicios y eventos con ubicación.

CREATE TABLE IF NOT EXISTS lugares (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('negocio','servicio','evento')),
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  categoria     TEXT,                       -- 'taquería', 'plomería', 'concierto'…

  -- Ubicación. lat/lng son NULL en servicios a domicilio sin local fijo.
  direccion     TEXT,
  colonia       TEXT,
  lat           REAL,
  lng           REAL,

  -- Contacto
  telefono      TEXT,
  whatsapp      TEXT,
  sitio_web     TEXT,
  horario       TEXT,

  -- Solo eventos
  inicia_en     TEXT,
  termina_en    TEXT,

  -- Autoría y moderación
  creado_por    TEXT REFERENCES users(id) ON DELETE SET NULL,
  estado        TEXT NOT NULL DEFAULT 'publicado'
                CHECK (estado IN ('publicado','oculto')),
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La vista de lista filtra por tipo; la de mapa consulta por caja envolvente.
CREATE INDEX IF NOT EXISTS idx_lugares_tipo   ON lugares(estado, tipo);
CREATE INDEX IF NOT EXISTS idx_lugares_geo    ON lugares(estado, lat, lng);
CREATE INDEX IF NOT EXISTS idx_lugares_autor  ON lugares(creado_por);
CREATE INDEX IF NOT EXISTS idx_lugares_evento ON lugares(estado, inicia_en);
