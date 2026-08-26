/**
 * Google OAuth 2.0 (Authorization Code).
 *
 * El parámetro `state` es defensa anti-CSRF: se genera al iniciar, se guarda
 * en cookie y se compara al volver. Sin esa comparación, un tercero podría
 * forzar el callback y enlazar su cuenta con la sesión de la víctima.
 */

const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const PERFIL = "https://openidconnect.googleapis.com/v1/userinfo";

export function configurado(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function urlAutorizacion(env, origen, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origen}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTORIZAR}?${params}`;
}

/** Canjea el código por un perfil. Devuelve { sub, email, nombre, avatar_url }. */
export async function perfilDesdeCodigo(env, origen, code) {
  const respToken = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${origen}/api/auth/google/callback`,
    }),
  });

  if (!respToken.ok) {
    throw new Error(`google token: ${respToken.status}`);
  }

  const { access_token } = await respToken.json();
  if (!access_token) throw new Error("google token: sin access_token");

  const respPerfil = await fetch(PERFIL, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!respPerfil.ok) throw new Error(`google userinfo: ${respPerfil.status}`);

  const p = await respPerfil.json();

  // Un correo sin verificar por Google no acredita identidad: se rechaza.
  if (!p.email || p.email_verified === false) {
    throw new Error("google: correo no verificado");
  }

  return {
    sub: p.sub,
    email: String(p.email).toLowerCase(),
    nombre: p.name ?? null,
    avatar_url: p.picture ?? null,
  };
}

/** Enlaza la cuenta de Google con el usuario, si aún no lo estaba. */
export async function enlazarCuenta(db, sub, userId) {
  await db.prepare(
    `INSERT INTO cuentas_oauth (proveedor, proveedor_id, user_id) VALUES ('google', ?, ?)
     ON CONFLICT(proveedor, proveedor_id) DO NOTHING`,
  ).bind(sub, userId).run();
}
