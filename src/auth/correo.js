/**
 * Envío de correo.
 *
 * Cascada deliberada, de mayor a menor disponibilidad:
 *   1. Brevo  — proveedor de producción (plan gratuito, 300/día).
 *   2. Binding EMAIL de Cloudflare — solo si algún día se pasa a Workers Paid;
 *      en `wrangler dev` existe como simulación y escribe el correo a disco,
 *      lo que hace probable el flujo en local sin credenciales.
 *   3. Log — último recurso en desarrollo: deja el enlace en la consola en vez
 *      de dejar el flujo sin salida.
 *
 * Devuelve true solo si un proveedor real aceptó el mensaje.
 */

const BREVO = "https://api.brevo.com/v3/smtp/email";

export async function enviarCorreo(env, { para, asunto, texto, html, enlaceDev }) {
  const remitente = {
    email: `acceso@${env.DOMINIO_CORREO ?? "logidma.com"}`,
    name: "Atarax",
  };

  if (env.BREVO_API_KEY) {
    try {
      const resp = await fetch(BREVO, {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: remitente,
          to: [{ email: para }],
          subject: asunto,
          textContent: texto,
          htmlContent: html,
        }),
      });

      if (resp.ok) return true;

      // El cuerpo del error se registra, nunca se devuelve al cliente:
      // revelaría si el buzón existe o no.
      const detalle = await resp.text().catch(() => "");
      console.error("brevo_rechazo", { status: resp.status, detalle: detalle.slice(0, 200) });
      return false;
    } catch (err) {
      console.error("brevo_fallo", { message: String(err) });
      return false;
    }
  }

  if (env.EMAIL) {
    try {
      await env.EMAIL.send({ to: para, from: remitente, subject: asunto, text: texto, html });
      return true;
    } catch (err) {
      console.error("cloudflare_email_fallo", { message: String(err) });
      return false;
    }
  }

  if (enlaceDev) console.log("ENLACE_DE_ACCESO", enlaceDev);
  return false;
}
