import { gsap } from "gsap";

const q = (s) => document.querySelector(s);

const ERRORES = {
  enlace: "Ese enlace ya se usó o caducó. Pide uno nuevo.",
  estado: "La sesión de acceso expiró. Inténtalo otra vez.",
  google: "No pudimos completar el acceso con Google.",
  google_no_configurado: "El acceso con Google aún no está disponible.",
};

function mostrarErrorDeUrl() {
  const motivo = new URLSearchParams(location.search).get("error");
  if (!motivo) return;
  const caja = q("[data-error]");
  caja.textContent = ERRORES[motivo] ?? "No pudimos iniciar sesión.";
  caja.hidden = false;
  // Se limpia de la URL: recargar no debe repetir el error.
  history.replaceState(null, "", location.pathname);
}

function intro() {
  document.documentElement.classList.add("is-ready");
  const tl = gsap.timeline({ defaults: { duration: 0.7, ease: "power3.out" } });
  tl.from("[data-nav]", { yPercent: -60, autoAlpha: 0, duration: 0.6 })
    .from("[data-caja]", { y: 24, autoAlpha: 0, scale: 0.985, duration: 0.9 }, "-=0.35");
  return tl;
}

function conectarFormulario() {
  const form = q("[data-form]");
  const input = q("#email");
  const boton = q("[data-submit]");
  const ok = q("[data-ok]");
  const error = q("[data-error]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();

    error.hidden = true;
    ok.hidden = true;

    if (!email || !input.checkValidity()) {
      error.textContent = "Escribe un correo válido.";
      error.hidden = false;
      input.focus();
      return;
    }

    boton.disabled = true;
    boton.textContent = "Enviando…";

    try {
      const resp = await fetch("/api/auth/enlace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const datos = await resp.json().catch(() => ({}));

      if (resp.status === 429) {
        error.textContent = datos.error ?? "Demasiados intentos. Espera unos minutos.";
        error.hidden = false;
      } else if (!resp.ok) {
        error.textContent = datos.error ?? "No pudimos enviar el enlace.";
        error.hidden = false;
      } else {
        ok.textContent = datos.aviso === "correo_no_configurado"
          ? "El envío de correo aún no está activo en este entorno."
          : datos.mensaje ?? "Revisa tu correo.";
        ok.hidden = false;
        form.reset();
      }
    } catch {
      error.textContent = "No hay conexión. Inténtalo de nuevo.";
      error.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = "Enviarme un enlace";
    }
  });
}

function arranque() {
  mostrarErrorDeUrl();
  conectarFormulario();

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: reduce)", () => {
    gsap.set("[data-nav], [data-caja]", { clearProps: "all", autoAlpha: 1 });
    document.documentElement.classList.add("is-ready");
  });
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const tl = intro();
    return () => tl.kill();
  });
}

if (document.readyState !== "loading") arranque();
else document.addEventListener("DOMContentLoaded", arranque, { once: true });
