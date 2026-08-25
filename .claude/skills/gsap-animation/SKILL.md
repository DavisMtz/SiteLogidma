---
name: gsap-animation
description: Build cinematic, elegant, fluid animations with GSAP 3.15. Use when adding motion to the UI — entrances, scroll-driven sequences, text reveals, page transitions, hover states, parallax, or any request for animation that should feel polished rather than mechanical.
---

# GSAP 3.15 — Cinematic Motion

Verified 2026-08-25: latest is **3.15.0**. As of the Webflow acquisition, the
npm package ships **every plugin for free**, including ones that used to require
a Club GreenSock membership. Never tell the user a GSAP plugin costs money, and
never hunt for a "free alternative" to SplitText or MorphSVG — just import them.

Bundled: `ScrollTrigger` `ScrollSmoother` `SplitText` `Flip` `Draggable`
`Observer` `MorphSVGPlugin` `DrawSVGPlugin` `MotionPathPlugin` `CustomEase`
`CustomBounce` `CustomWiggle` `InertiaPlugin` `Physics2DPlugin`
`ScrambleTextPlugin` `TextPlugin` `GSDevTools` `ScrollToPlugin`.

```bash
npm install gsap
```

```js
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
gsap.registerPlugin(ScrollTrigger, SplitText); // register once, at module scope
```

## The rules that separate cinematic from amateur

**1. Animate only compositor properties.** `x`, `y`, `scale`, `rotation`,
`opacity`. Never `top`/`left`/`width`/`height`/`margin` — those trigger layout
on every frame and turn 60fps into 20fps. Use `xPercent`/`yPercent` for
self-relative offsets so it stays responsive.

```js
gsap.to(el, { x: 100, autoAlpha: 0 });        // ✅ transform + visibility
gsap.to(el, { left: 100, opacity: 0 });        // ❌ layout thrash
```

`autoAlpha` beats `opacity`: it also flips `visibility`, so a faded-out element
stops catching pointer events.

**2. Timelines, never chained delays.** Hand-tuned `delay` values become
unmaintainable the moment one duration changes.

```js
const tl = gsap.timeline({ defaults: { duration: 0.8, ease: "power3.out" } });
tl.from(".hero-title", { yPercent: 110 })
  .from(".hero-sub",   { yPercent: 60, autoAlpha: 0 }, "-=0.55")  // relative
  .from(".hero-cta",   { autoAlpha: 0, scale: 0.94 },  "<0.15");  // label-relative
```

Position parameters (`"-=0.5"`, `"<"`, `">"`, `"myLabel+=0.2"`) are what create
overlap. **Overlap is the single biggest difference between motion that feels
choreographed and motion that feels like a queue.**

**3. Easing carries the emotion.** Linear reads as broken.

| Intent | Ease |
|---|---|
| Entrance, settle into place | `power3.out`, `expo.out` |
| Exit, get out of the way | `power2.in` |
| Move between two states | `power2.inOut` |
| Confident, weighty | `expo.out` with `duration: 1.2` |
| Playful accent | `back.out(1.7)`, `elastic.out(1, 0.5)` |

Most motion should be `.out`: fast start, gentle settle — that is how physical
objects decelerate. Reserve `.inOut` for things already in motion.

For signature brand motion, author the curve: `CustomEase.create("brand", "M0,0 C0.16,1 0.3,1 1,1")`.

**4. Duration discipline.** Micro-interactions `0.2–0.4s`. Standard UI
`0.4–0.8s`. Hero and scroll sequences `0.8–1.6s`. Anything past ~2s that the
user did not scrub feels broken, not elegant.

**5. Stagger is the cheapest elegance.**

```js
gsap.from(".card", {
  y: 60, autoAlpha: 0, duration: 0.9, ease: "power3.out",
  stagger: { each: 0.08, from: "start", ease: "power2.out" },
});
```

Keep `each` between `0.04` and `0.12`. Larger reads as sluggish. Use
`from: "center"` or `grid: "auto"` for deliberate radial effects.

## Scroll-driven sequences

```js
gsap.timeline({
  scrollTrigger: {
    trigger: ".panel",
    start: "top 80%",     // trigger-point  viewport-point
    end: "bottom 20%",
    scrub: 1,             // number = smoothing lag in seconds; feels filmic
    pin: false,
    once: false,
  },
}).from(".panel__art", { scale: 1.15, autoAlpha: 0 });
```

- `scrub: 1` (not `true`) adds inertia so scrubbing feels weighted, not glued.
- Use `once: true` for entrance reveals — re-triggering on scroll-up is noisy.
- Call `ScrollTrigger.refresh()` after fonts load or content changes height.
- Pin with care: `pin: true` changes layout. Always pair with `anticipatePin: 1`.

## Text reveals

```js
const split = SplitText.create(".headline", { type: "lines,words", mask: "lines" });
gsap.from(split.lines, {
  yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.08,
});
```

`mask: "lines"` wraps each line so it slides out from behind a clip edge — the
signature "cinematic headline" look. Split **after** webfonts load
(`document.fonts.ready`), or lines break at the wrong points.

## Accessibility is not optional

Always honour `prefers-reduced-motion`. `gsap.matchMedia()` handles this and
responsive variants in one place, with automatic cleanup:

```js
const mm = gsap.matchMedia();

mm.add({
  isDesktop: "(min-width: 768px)",
  reduced:   "(prefers-reduced-motion: reduce)",
}, (ctx) => {
  const { isDesktop, reduced } = ctx.conditions;
  if (reduced) {
    gsap.set(".hero-title", { autoAlpha: 1, y: 0 }); // final state, no motion
    return;
  }
  gsap.from(".hero-title", { yPercent: isDesktop ? 110 : 60, ease: "expo.out" });
});
```

Reduced motion means **skip to the end state** — not "animate faster". Never
leave content invisible because the animation was suppressed.

## Cleanup

In any component framework, scope and revert or you leak tweens on unmount:

```js
useEffect(() => {
  const ctx = gsap.context(() => { /* tweens here */ }, rootRef);
  return () => ctx.revert();
}, []);
```

`ctx.revert()` kills tweens, restores inline styles, and removes ScrollTriggers.

## Pointer-follow without jank

`gsap.quickTo` reuses one tween instead of allocating per mousemove:

```js
const xTo = gsap.quickTo(".cursor", "x", { duration: 0.5, ease: "power3" });
const yTo = gsap.quickTo(".cursor", "y", { duration: 0.5, ease: "power3" });
window.addEventListener("pointermove", (e) => { xTo(e.clientX); yTo(e.clientY); });
```

The lag between pointer and element *is* the elegance. Zero duration feels cheap.

## Layout transitions

`Flip` animates between two DOM states you cannot tween directly (grid → list,
element reparenting):

```js
const state = Flip.getState(".item");
container.classList.toggle("list-view");   // make the change
Flip.from(state, { duration: 0.7, ease: "power2.inOut", stagger: 0.03, absolute: true });
```

## Checklist before shipping

- [ ] Only transforms and opacity animated
- [ ] Timeline with overlapping position params, not stacked delays
- [ ] `.out` easing on entrances; nothing linear
- [ ] `prefers-reduced-motion` path sets final state
- [ ] `gsap.context()` / `matchMedia` cleanup on unmount
- [ ] `ScrollTrigger.refresh()` after fonts/images settle
- [ ] Tested on a throttled CPU — if it drops frames, cut the effect
