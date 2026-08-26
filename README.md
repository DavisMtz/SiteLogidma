# SiteLogidma

Monorepo de aplicaciones desplegadas en **Cloudflare Workers**.

Aplicación activa: **Atarax** → <https://atarax.logidma.com>

---

## 1. Mapa del repositorio

```
SiteLogidma/
├── README.md                  ← este documento
├── wrangler.jsonc             ← Worker + assets + bindings
├── package.json               ← scripts (build / dev / deploy / tail)
├── .gitignore
│
├── public/                    ← se sirve desde Static Assets de Cloudflare
│   ├── index.html             ← vista de inicio
│   ├── entrar.html            ← pantalla de acceso
│   ├── styles.css             ← tokens y sistema de diseño
│   ├── favicon.svg
│   ├── main.js, entrar.js     ← BUILD: los genera esbuild, no se versionan
│   └── fonts/                 ← Fraunces e Inter auto-hospedadas (SIL OFL)
│
├── migrations/
│   └── 0001_auth.sql          ← esquema de autenticación para D1
│
├── src/
│   ├── index.js               ← Worker: rutas y cabeceras de seguridad
│   ├── auth/                  ← autenticación
│   │   ├── rutas.js           ← endpoints
│   │   ├── sesiones.js        ← sesiones y usuarios en D1
│   │   ├── enlace-magico.js   ← tokens de un solo uso y correo
│   │   ├── google.js          ← OAuth 2.0
│   │   ├── origen.js          ← origen canónico (anti inyección de Host)
│   │   ├── cookies.js         ← cookie __Host- de sesión
│   │   ├── crypto.js          ← tokens con Web Crypto
│   │   └── limites.js         ← límite de intentos
│   └── client/
│       ├── main.js            ← orquestación GSAP del inicio
│       └── entrar.js          ← pantalla de acceso
│
└── .claude/
    └── skills/                ← instrucciones que Claude carga automáticamente
        ├── gsap-animation/SKILL.md
        └── web-security/SKILL.md
```

**Flujo de una petición**

```
navegador → Worker (src/index.js)
              ├── /api/*  → responde el Worker
              └── resto   → env.ASSETS.fetch() → public/
            todas las respuestas salen con cabeceras de seguridad
```

---

## 2. Infraestructura en Cloudflare

| Recurso | Valor |
|---|---|
| Worker | `atarax` |
| URL pública | <https://atarax.logidma.com> (dominio propio) |
| URL de respaldo | <https://atarax.logidma.workers.dev> |
| Zona Cloudflare | `logidma.com` |
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
| `/` | Vista de inicio |
| `/api/health` | `{"status":"ok","app":"atarax"}` |

---

## 3. Orden de trabajo

### Puesta en marcha

```bash
npm install
npm run build     # esbuild empaqueta GSAP en public/app.js
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
| Zone | Zone | Read | Resolver la zona del dominio propio (`logidma.com`) |

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

## 6. Dominio

El sitio se sirve en **<https://atarax.logidma.com>**, un dominio propio dentro de
la zona `logidma.com`. El subdominio `atarax.logidma.workers.dev` sigue activo como
respaldo: un Worker puede tener ambos a la vez.

La ruta está declarada en `wrangler.jsonc`, no solo dada de alta en el panel:

```jsonc
"routes": [
  { "pattern": "atarax.logidma.com", "custom_domain": true }
]
```

Declararla la deja versionada: si el Worker se recrea desde cero, el despliegue
restablece la ruta sin tocar el panel. A cambio, el token de despliegue necesita
ver la zona — basta con `Zone: Read` sobre `logidma.com`.

Cloudflare emite y renueva el certificado TLS del subdominio automáticamente.

Para añadir otro dominio o subdominio, agrégalo al array `routes` con
`"custom_domain": true` y despliega.

---

## 7. Autenticación

La sesión es **opcional**: buscar en Atarax no requiere cuenta. Solo hace falta
para guardar favoritos, reseñar o gestionar la ficha de un negocio.

Dos vías, ambas sin contraseñas:

| Vía | Ruta de entrada | Estado |
|---|---|---|
| Enlace mágico por correo | `POST /api/auth/enlace` | Requiere habilitar Email Sending |
| Google OAuth | `GET /api/auth/google` | Requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` |

Ambas convergen en el mismo usuario: **la identidad es el correo**, así que
quien entre una vez por enlace y otra por Google acaba en la misma cuenta.

### 7.1 Rutas

| Ruta | Método | Qué hace |
|---|---|---|
| `/entrar` | GET | Pantalla de acceso |
| `/api/auth/enlace` | POST | Envía el enlace mágico. Limitado por correo e IP |
| `/entrar/verificar?token=` | GET | Canjea el enlace y abre sesión |
| `/api/auth/google` | GET | Redirige a Google con `state` anti-CSRF |
| `/api/auth/google/callback` | GET | Valida `state`, canjea el código, abre sesión |
| `/api/auth/yo` | GET | Estado de sesión, para pintar la cabecera |
| `/api/auth/salir` | POST | Revoca la sesión en servidor |

### 7.2 Decisiones de seguridad

Cada una responde a un ataque concreto:

- **Tokens hasheados en la base.** Ni los enlaces ni las sesiones se guardan en
  claro: quien lea la base de datos no obtiene nada con lo que iniciar sesión.
- **Enlace de un solo uso y 15 minutos.** El canje marca el token en la misma
  condición SQL, así que dos peticiones simultáneas no pueden usarlo dos veces.
- **Sesiones en D1, no JWT.** Un JWT firmado no se puede revocar antes de que
  caduque; una fila sí. Cerrar sesión es un `DELETE`.
- **Cookie `__Host-`** con `HttpOnly`, `Secure`, `SameSite=Lax`. El prefijo lo
  impone el navegador: ningún subdominio comprometido puede sobrescribirla.
- **Origen canónico, no `url.origin`.** El enlace mágico se construye desde
  `ORIGENES_PERMITIDOS`, nunca desde la cabecera `Host`. Sin esto, un `Host`
  falsificado haría que el correo llevase a la víctima al dominio del atacante
  con un token válido — **inyección de Host**.
- **`state` obligatorio en OAuth.** Se guarda en cookie efímera y se compara al
  volver; sin coincidencia no se sigue.
- **Correo de Google sin verificar → rechazado.** No acredita identidad.
- **Respuesta idéntica exista o no la cuenta.** Evita enumerar usuarios.
- **Límite de intentos** por correo (5) y por IP (20) en ventanas de 15 minutos.
- **Aleatoriedad con Web Crypto.** `Math.random()` es predecible y no vale aquí.

### 7.3 Lo que falta configurar

**Correo** — habilitar el envío en el dominio, una sola vez:

```bash
npx wrangler email sending enable logidma.com
```

El token de despliegue necesita entonces `Email Sending: Edit`.

**Google** — crear el cliente OAuth en Google Cloud Console con este URI de
redirección autorizado:

```
https://atarax.logidma.com/api/auth/google/callback
```

Y guardar las credenciales como secretos (nunca en `wrangler.jsonc`):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Mientras falten, cada vía degrada sin romper: Google avisa de que no está
disponible y el enlace mágico responde `correo_no_configurado`.

### 7.4 Probar en local

`wrangler dev` simula el binding de correo y **escribe el mensaje a disco** en
vez de enviarlo. El enlace está ahí:

```bash
cat .wrangler/tmp/email/*/email-text/*.txt
```

Copia `.dev.vars.example` a `.dev.vars` para apuntar los enlaces a tu servidor
local y probar las credenciales de Google sin tocar producción.

---

## 8. Directrices de diseño

Estas reglas son vinculantes: toda vista nueva de Atarax debe cumplirlas.

### 6.1 Principio rector

Atarax es un directorio **local**. El diseño no es decoración genérica: está anclado
en Morelia. Dos referencias sostienen toda la identidad visual:

- **Cantera rosa** — la piedra volcánica del centro histórico. Es el acento primario.
- **Acueducto** — sus arcos son el motivo gráfico. Aparecen como línea de horizonte,
  nunca como adorno suelto.

Antes de añadir un elemento decorativo, pregúntate si nace de ahí. Si no, sobra.

### 6.2 Color

Todo color sale de un token en `:root`. **Nunca escribas un hexadecimal suelto en una regla.**

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#12100F` | Fondo. Negro cálido, nunca gris neutro |
| `--surface` | `#1B1614` | Tarjetas, campos |
| `--surface-2` | `#241D1A` | Superficie elevada |
| `--text` | `#F5F0EB` | Texto principal (blanco cálido, no `#fff`) |
| `--text-muted` | `#A79A91` | Texto secundario |
| `--text-faint` | `#6E635C` | Placeholders, iconos inertes |
| `--cantera` | `#E3A0A8` | **Acento primario.** Acciones, énfasis, foco |
| `--cantera-deep` | `#B96872` | Estados presionados |
| `--jacaranda` | `#9C8FC7` | Acento secundario (categoría: servicios) |
| `--gold` | `#D9B36C` | Acento terciario (categoría: eventos) |
| `--line` / `--line-strong` | blancos al 10% / 18% | Bordes |

Regla de proporción: **el acento nunca supera ~10% de la superficie visible**. La
elegancia aquí viene del contraste contenido, no de la saturación.

### 6.3 Tipografía

Dos familias, auto-hospedadas en `/public/fonts` (SIL OFL, subconjunto latin):

| Familia | Rol | Cuándo |
|---|---|---|
| **Fraunces** | Display, serif variable | Titulares, nombres de sección, marca |
| **Inter** | Interfaz, sans | Cuerpo, botones, campos, etiquetas |

- Los titulares van en peso **300**, no en negrita: a tamaño grande, el peso ligero
  es lo que se lee como refinado.
- El registro interrogativo (`¿Qué quieres hacer hoy?`) va en **cursiva de Fraunces**.
  Es la voz de la marca: pregunta, no ordena.
- Todo tamaño usa `clamp()` desde la escala `--step-*`. Nunca fijes `px` sueltos.

**No añadas una tercera familia.** Si algo necesita distinguirse, usa peso, tamaño
o color, en ese orden.

### 6.4 Movimiento

Rige la skill `gsap-animation`. Resumen operativo:

- Una **sola línea de tiempo** orquesta la entrada. Nada anima por su cuenta.
- El orden narra: contexto → identidad → pregunta → herramienta → fondo → opciones.
  El acueducto se dibuja **después** del buscador: es escenografía, no protagonista.
- Solapamiento obligatorio (`"-=0.6"`, `"<"`). Retardos apilados están prohibidos.
- Easing `.out` en entradas (`power3.out`, `expo.out`). Nada lineal.
- Solo se animan `transform` y `opacity`.
- `prefers-reduced-motion` salta al estado final. No es opcional.

### 6.5 Forma y espacio

- Radio: `999px` en píldoras (botones, buscador), `--radius` (16px) en tarjetas.
- El espaciado nace de `--gutter` y de `clamp()` ligado al viewport, no de valores fijos.
- Las tarjetas se elevan 3px en hover. Ningún movimiento de hover pasa de eso.

### 6.6 SVG

- Trazo, no relleno: `fill="none"` con `stroke="currentColor"`, grosor `2` a 48px.
- El color se hereda con `currentColor`, para que el token mande.
- Todo SVG decorativo lleva `aria-hidden="true"` y `focusable="false"`.
- Los iconos comparten métrica: mismo viewBox, mismo grosor, misma terminación.

### 6.7 Accesibilidad

Innegociable en cualquier vista:

- Contraste mínimo **4.5:1** en texto; el par `--text` sobre `--bg` lo supera con holgura.
- `:focus-visible` siempre visible, en `--cantera`, con `outline-offset`.
- Todo control sin texto visible lleva `aria-label`.
- El HTML se mantiene legible sin CSS ni JS: encabezados en orden, `label` en cada campo.
- Ningún contenido depende solo del color para entenderse.

---

## 9. Skills incluidas

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

## 10. Convenciones

- **Nunca** commitear secretos. Usar `wrangler secret put` o `.dev.vars`.
- Toda consulta a D1 con `.bind()`; jamás construir SQL por concatenación.
- Animar solo `transform` y `opacity`; nunca `top`/`left`/`width`/`height`.
- Respetar `prefers-reduced-motion` en toda animación.
- Validar con `--dry-run` antes de cada despliegue.
- Ramas de trabajo → PR → merge a `main`.
