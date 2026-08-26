/**
 * Origen canónico del sitio.
 *
 * El enlace mágico NO puede construirse con `url.origin` a secas: ese valor
 * deriva de la cabecera Host, y si un atacante consigue influirla, el correo
 * llevaría a la víctima a su dominio con un token válido en la mano
 * (inyección de Host). Se acepta solo lo que esté en la lista permitida y,
 * si no coincide, se usa el canónico.
 */

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function origenCanonico(env, url) {
  const permitidos = (env.ORIGENES_PERMITIDOS ?? "")
    .split(",").map((o) => o.trim()).filter(Boolean);

  // En desarrollo el origen local es legítimo y hace usable el flujo.
  if (LOCAL.test(url.origin)) return url.origin;

  if (permitidos.includes(url.origin)) return url.origin;

  return permitidos[0] ?? url.origin;
}
