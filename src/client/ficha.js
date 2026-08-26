/**
 * Movimiento de la ficha.
 *
 * La ficha se renderiza en el servidor, así que el contenido ya está ahí antes
 * de que corra este script: la animación decora, nunca condiciona la lectura.
 * Si el JS falla, la página sigue completa.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { entrada, reducido } from "./entrada.js";

gsap.registerPlugin(ScrollTrigger);

function arranque() {
  entrada([
    [".nav", { yPercent: -60, duration: 0.6 }],
    [".ficha__duenio", { y: 12, duration: 0.6 }],
    [".ficha__migas", { y: 10, duration: 0.55 }],
    [".ficha__titulo", { y: 22, duration: 0.9 }],
    [".ficha__desc", { y: 16 }],
    [".calendario", { y: 14 }],
    [".datos", { y: 18 }],
  ]);

  if (reducido()) return;

  // El catálogo puede ser largo: cada sección se revela al acercarse, una vez.
  for (const sec of document.querySelectorAll(".catalogo .seccion")) {
    gsap.from(sec, {
      y: 26, autoAlpha: 0, duration: 0.7, ease: "power3.out",
      scrollTrigger: { trigger: sec, start: "top 88%", once: true },
    });
    const items = sec.querySelectorAll(".item");
    if (items.length) {
      gsap.from(items, {
        y: 14, autoAlpha: 0, duration: 0.5, ease: "power2.out",
        stagger: { each: 0.05, ease: "power2.out" },
        scrollTrigger: { trigger: sec, start: "top 84%", once: true },
      });
    }
  }

  const h2 = document.querySelector(".ficha__h2");
  if (h2) {
    gsap.from(h2, {
      y: 18, autoAlpha: 0, duration: 0.6, ease: "power3.out",
      scrollTrigger: { trigger: h2, start: "top 90%", once: true },
    });
  }

  // Las webfonts cambian la altura del documento y desplazan los disparadores.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

if (document.readyState !== "loading") arranque();
else document.addEventListener("DOMContentLoaded", arranque, { once: true });
