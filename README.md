# SiteLogidma

Monorepo de aplicaciones desplegadas en **Cloudflare Workers**.

Aplicación activa: **Atarax** → <https://atarax.logidma.workers.dev>

---

## 1. Mapa del repositorio

```
SiteLogidma/
├── README.md                  ← este documento
├── wrangler.jsonc             ← configuración de despliegue (Worker + bindings)
├── package.json               ← scripts y dependencias (wrangler fijado)
├── package-lock.json          ← lockfile: no editar a mano
├── .gitignore                 ← node_modules, .wrangler, .dev.vars, .env
│
├── src/
│   └── index.js               ← punto de entrada del Worker (fetch handler)
│
└── .claude/
    └── skills/                ← instrucciones que Claude carga automáticamente
        ├── gsap-animation/
        │   └── SKILL.md       ← animación cinematográfica con GSAP 3.15
        └── web-security/
            └── SKILL.md       ← seguridad para Workers + D1
```

---

## 2. Infraestructura en Cloudflare

| Recurso | Valor |
|---|---|
| Worker | `atarax` |
| URL pública | <https://atarax.logidma.workers.dev> |
| Subdominio de cuenta | `logidma.workers.dev` |
| Base de datos D1 | `morelia` |
| Binding en código | `env.morelia` |
| Región D1 | ENAM |
| Plan | Free (100 000 peticiones/día) |
| Observabilidad | Activada |

> El `database_id` y el account ID viven en `wrangler.jsonc`. **No son secretos**:
> son identificadores de recurso y Cloudflare documenta commitearlos.

### Rutas de la aplicación

| Ruta | Respuesta |
|---|---|
| `/` | Landing HTML |
| `/health` | `{"status":"ok","app":"atarax"}` |

---

## 3. Orden de trabajo

### Puesta en marcha

```bash
npm install
```

### Desarrollo local

```bash
npm run dev          # http://localhost:8787 — usa D1 local, no toca producción
```

### Validar antes de desplegar

```bash
npx wrangler deploy --dry-run    # compila y muestra bindings, sin publicar
```

### Desplegar

```bash
npm run deploy
```

Requiere autenticación. Dos vías:

```bash
npx wrangler login                        # OAuth por navegador (entorno local)
export CLOUDFLARE_API_TOKEN="..."         # API token (entornos sin navegador/CI)
```

### Ver logs en vivo

```bash
npm run tail
```

---

## 4. Permisos de API token

Token mínimo para desplegar este proyecto:

| Tipo | Recurso | Nivel | Para qué |
|---|---|---|---|
| Account | Workers Scripts | Edit | Subir y publicar el Worker |
| Account | D1 | Edit | Validar el binding `morelia` |
| Account | Account Settings | Read | Resolver el `account_id` |

Restringir a una sola cuenta, ponerle TTL y **rotarlo tras compartirlo**.
Alternativa más cerrada: omitir `Account Settings: Read` y exportar
`CLOUDFLARE_ACCOUNT_ID` a mano.

---

## 5. Base de datos D1 (`morelia`)

Actualmente **sin tablas**. Cuando exista esquema:

```bash
npx wrangler d1 execute morelia --local  --file=./schema.sql   # local
npx wrangler d1 execute morelia --remote --file=./schema.sql   # producción
npx wrangler d1 info morelia                                   # estado
```

Acceso desde el Worker — **siempre con parámetros vinculados**:

```js
const row = await env.morelia.prepare("SELECT * FROM tracks WHERE id = ?")
  .bind(id).first();
```

---

## 6. Skills incluidas

Viven en `.claude/skills/` y se cargan solas al trabajar en este repo.
Como están versionadas, viajan con el repositorio: cualquier sesión o
colaborador las hereda sin instalar nada.

| Skill | Cubre |
|---|---|
| `gsap-animation` | GSAP 3.15: timelines, easing, stagger, ScrollTrigger, SplitText, Flip, `prefers-reduced-motion`, limpieza con `gsap.context()` |
| `web-security` | Secretos, inyección SQL en D1, XSS, cabeceras de seguridad, CORS, validación, rate limiting, higiene de tokens |

### Nota sobre GSAP

Desde la adquisición por Webflow, **GSAP incluye todos sus plugins gratis** en el
paquete npm — SplitText, MorphSVG, DrawSVG, ScrollSmoother, CustomEase,
InertiaPlugin y GSDevTools incluidos. Ya no hay plugins de pago.

```bash
npm install gsap    # 3.15.0
```

---

## 7. Convenciones

- **Nunca** commitear secretos. Usar `wrangler secret put` o `.dev.vars`.
- Toda consulta a D1 con `.bind()`; jamás construir SQL por concatenación.
- Animar solo `transform` y `opacity`; nunca `top`/`left`/`width`/`height`.
- Respetar `prefers-reduced-motion` en toda animación.
- Validar con `--dry-run` antes de cada despliegue.
- Ramas de trabajo → PR → merge a `main`.
