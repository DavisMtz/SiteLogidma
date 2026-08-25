import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

const q = (sel) => document.querySelector(sel);

/** Estado final de la entrada, sin movimiento. */
function settle() {
  gsap.set("[data-eyebrow], [data-title], [data-ask], [data-search], [data-can-title], [data-can-lede], .card, [data-nav]", {
    clearProps: "all", autoAlpha: 1,
  });
  gsap.set(".arch", { strokeDashoffset: 0 });
  document.documentElement.classList.add("is-ready");
}

function intro() {
  // Los arcos son trazos: se miden para poder dibujarlos.
  const arches = gsap.utils.toArray(".arch");
  arches.forEach((path) => {
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  });

  // El titular se parte en líneas enmascaradas: entran desde detrás del corte.
  const title = new SplitText("[data-title]", { type: "lines", mask: "lines" });

  document.documentElement.classList.add("is-ready");

  const tl = gsap.timeline({
    defaults: { duration: 0.9, ease: "power3.out" },
  });

  tl.from("[data-nav]", { yPercent: -60, autoAlpha: 0, duration: 0.7 })

    .from("[data-eyebrow]", { y: 18, autoAlpha: 0, duration: 0.7 }, "-=0.35")

    .from(title.lines, {
      yPercent: 115, duration: 1.1, ease: "expo.out", stagger: 0.09,
    }, "-=0.4")

    .from("[data-ask]", { y: 22, autoAlpha: 0 }, "-=0.75")

    .from("[data-search]", {
      y: 26, autoAlpha: 0, scale: 0.97, duration: 1, ease: "power3.out",
    }, "-=0.6")

    // El acueducto se dibuja mientras baja la mirada: es fondo, no protagonista.
    .to(arches, {
      strokeDashoffset: 0, duration: 1.9, ease: "power2.inOut", stagger: 0.055,
    }, "-=0.7")

    .from("[data-can-title]", { y: 20, autoAlpha: 0, duration: 0.8 }, "-=1.25")
    .from("[data-can-lede]",  { y: 20, autoAlpha: 0, duration: 0.8 }, "<0.08")

    .from(".card", {
      y: 34, autoAlpha: 0, duration: 0.9,
      stagger: { each: 0.08, ease: "power2.out" },
    }, "-=0.55");

  return tl;
}

function ready(fn) {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
}

ready(() => {
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: reduce)", () => { settle(); });

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // SplitText necesita las webfonts ya cargadas o parte las líneas mal.
    const start = () => { const tl = intro(); return () => tl.kill(); };
    if (document.fonts?.status === "loaded") return start();

    let cleanup;
    document.fonts?.ready.then(() => { cleanup = start(); });
    // Si las fuentes tardan, no dejamos la página en blanco.
    const guard = setTimeout(() => { if (!cleanup) cleanup = start(); }, 1200);

    return () => { clearTimeout(guard); cleanup?.(); };
  });

  // El envío vacío no debe recargar a una búsqueda sin término.
  q("[data-search]")?.addEventListener("submit", (e) => {
    const input = q("#q");
    if (!input?.value.trim()) { e.preventDefault(); input?.focus(); }
  });
});
