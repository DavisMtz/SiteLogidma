/**
 * Entrada compartida.
 *
 * Existe para que todas las pantallas entren con la misma cadencia. Antes cada
 * página traía su propia línea de tiempo —y «Mis lugares» y «Agregar» no traían
 * ninguna—, así que navegar entre ellas se sentía como cambiar de sitio web.
 */

import { gsap } from "gsap";

/**
 * @param {Array<[string, object]>} pasos  selector y propiedades de origen,
 *        en el orden en que deben aparecer.
 */
export function entrada(pasos, { solapamiento = "-=0.45" } = {}) {
  const selectores = pasos.map(([sel]) => sel).join(", ");
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: reduce)", () => {
    // Movimiento reducido: estado final directo, nunca contenido invisible.
    gsap.set(selectores, { clearProps: "all", autoAlpha: 1 });
    document.documentElement.classList.add("is-ready");
  });

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    document.documentElement.classList.add("is-ready");
    const tl = gsap.timeline({ defaults: { duration: 0.75, ease: "power3.out" } });

    pasos.forEach(([sel, props], i) => {
      if (!document.querySelector(sel)) return;
      // El solapamiento es lo que hace que se lea coreografiado y no como
      // una cola de elementos esperando turno.
      tl.from(sel, { autoAlpha: 0, ...props }, i === 0 ? 0 : solapamiento);
    });

    return () => tl.kill();
  });

  return mm;
}

/** Aparición escalonada de una lista ya presente en el DOM. */
export function escalonar(elementos, { desde = 14 } = {}) {
  if (!elementos.length || reducido()) return;
  gsap.from(elementos, {
    y: desde, autoAlpha: 0, duration: 0.55, ease: "power2.out",
    stagger: { each: 0.045, ease: "power2.out" },
  });
}

export const reducido = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
