-- Atarax — autenticación
-- Enlace mágico por correo + Google OAuth. Sesión opcional: buscar no la requiere.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,              -- UUID v4
  email         TEXT NOT NULL UNIQUE,          -- siempre normalizado en minúsculas
  nombre        TEXT,
  avatar_url    TEXT,
  email_verificado INTEGER NOT NULL DEFAULT 0,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT
);

-- Cuentas externas ligadas a un usuario (por ahora: google).
-- Un mismo usuario puede entrar por enlace mágico y por Google con el mismo correo.
CREATE TABLE IF NOT EXISTS cuentas_oauth (
  proveedor     TEXT NOT NULL,                 -- 'google'
  proveedor_id  TEXT NOT NULL,                 -- 'sub' del proveedor
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (proveedor, proveedor_id)
);
CREATE INDEX IF NOT EXISTS idx_cuentas_oauth_user ON cuentas_oauth(user_id);

-- Enlaces mágicos. Se guarda el HASH del token, nunca el token en claro:
-- si alguien lee la base, no puede iniciar sesión con lo que encuentre.
CREATE TABLE IF NOT EXISTS enlaces_acceso (
  token_hash    TEXT PRIMARY KEY,              -- SHA-256 del token
  email         TEXT NOT NULL,
  expira_en     TEXT NOT NULL,
  usado_en      TEXT,                          -- un solo uso: se marca al canjear
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  ip_solicitud  TEXT
);
CREATE INDEX IF NOT EXISTS idx_enlaces_email ON enlaces_acceso(email);
CREATE INDEX IF NOT EXISTS idx_enlaces_expira ON enlaces_acceso(expira_en);

-- Sesiones. También por hash, y revocables: por eso van en D1 y no en un JWT.
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_en     TEXT NOT NULL,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sesiones_user ON sesiones(user_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira_en);

-- Control de abuso en el endpoint de login, que es el que atacan.
CREATE TABLE IF NOT EXISTS intentos_acceso (
  clave         TEXT NOT NULL,                 -- 'email:...' o 'ip:...'
  ventana_en    TEXT NOT NULL,                 -- inicio de la ventana
  intentos      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (clave, ventana_en)
);
