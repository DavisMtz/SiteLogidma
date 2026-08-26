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
│   ├── _headers               ← cabeceras de seguridad de los assets
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
│   │   ├── enlace-magico.js   ← tokens de un solo uso y plantilla
│   │   ├── correo.js          ← cascada de proveedores de envío
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

## 2. Mapa de plataformas

Todo el proyecto corre en **plan gratuito**. Esta sección registra qué hace cada
plataforma, qué se configuró en ella y qué credenciales usa.

### 2.1 Resumen

| Plataforma | Función en Atarax | Plan | Credencial |
|---|---|---|---|
| **Cloudflare Workers** | Ejecuta el sitio y la API | Free | API token de despliegue |
| **Cloudflare Static Assets** | Sirve HTML, CSS, JS y fuentes | Free (incluido) | — |
| **Cloudflare D1** | Base de datos `morelia` | Free | Binding `env.morelia` |
| **Cloudflare DNS** | Zona `logidma.com` | Free | API token |
| **Google Cloud OAuth** | Inicio de sesión con Google | Gratis | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (secretos) |
| **Brevo** | Envío del enlace mágico | Free (300/día) | `BREVO_API_KEY` (secreto) |
| **GitHub** | Repositorio y PRs | Free | — |

Fuera del proyecto pero **en el mismo dominio**, y por tanto relevante al tocar DNS:

| Plataforma | Qué usa de `logidma.com` |
|---|---|
| Google Workspace | MX del dominio, DKIM en `google._domainkey` |
| Firebase | Incluido en el SPF (`_spf.firebasemail.com`) |

### 2.2 Cloudflare — qué está configurado

| Elemento | Valor |
|---|---|
| Account ID | `1ef6a06b0e674b43f95c90a63863bc69` |
| Worker | `atarax` |
| Subdominio de cuenta | `logidma.workers.dev` |
| Dominio propio | `atarax.logidma.com` (declarado en `wrangler.jsonc`) |
| Zona | `logidma.com` |
| D1 | `morelia` · región ENAM · 5 tablas de autenticación |
| Observabilidad | Activada |
| Variables (`vars`) | `DOMINIO_CORREO`, `ORIGENES_PERMITIDOS` |
| Secretos | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BREVO_API_KEY` |

### 2.3 Google Cloud — qué está configurado

| Elemento | Valor |
|---|---|
| Tipo | Cliente OAuth 2.0 (aplicación web) |
| URI de redirección | `https://atarax.logidma.com/api/auth/google/callback` |
| Ámbitos | `openid email profile` |
| Coste | Gratuito |

### 2.4 Brevo — qué falta configurar

| Elemento | Estado |
|---|---|
| Cuenta | Pendiente |
| Dominio `logidma.com` autenticado | Pendiente — añade registros DNS, revisar que no choquen |
| Clave API (`xkeysib-…`) | Pendiente |

**Cuidado con las credenciales de Brevo:** hay dos y se parecen. La clave **SMTP**
(`xsmtpsib-…`) **no sirve**: el Worker habla con la API REST y necesita una clave
**API** (`xkeysib-…`), que está en *SMTP & API → pestaña API Keys*.

### 2.5 Límites del plan gratuito

Verificados en la documentación de Cloudflare:

| Recurso | Límite gratuito | Consumo de Atarax |
|---|---|---|
| Peticiones al Worker | 100.000/día | Solo API y autenticación |
| **Peticiones a assets** | **Gratis e ilimitadas** | Todo el front |
| Tiempo de CPU | 10 ms por petición | Muy por debajo |
| Subpeticiones | 50 por invocación | 1–2 (Brevo o Google) |
| D1: tamaño | 500 MB por base · 5 GB por cuenta | Vacío aún |
| D1: consultas | 50 por invocación | 3–5 en autenticación |
| D1: recuperación | 7 días de Time Travel | — |
| Brevo | 300 correos/día | Enlaces mágicos |

**Por qué los assets son gratis:** el `wrangler.jsonc` **no** usa
`run_worker_first`. Con esa opción cada CSS y cada fuente invocaba al Worker y
gastaba de los 100.000 diarios; peor aún, al agotarlos Cloudflare devuelve **429**
en vez de servir el archivo, y el sitio entero cae. Sin ella, los assets se sirven
gratis e ilimitados y la cuota se reserva para lo que de verdad ejecuta lógica.
Las cabeceras de seguridad de los assets viven en `public/_headers`.

### 2.6 Qué más da el plan gratuito, sin usar todavía

Disponible a coste cero si hace falta:

| Servicio | Qué aporta a Atarax | Límite gratuito |
|---|---|---|
| **Turnstile** | CAPTCHA sin fricción en el registro | Gratis |
| **R2** | Fotos de negocios y eventos | 10 GB, egreso gratis |
| **KV** | Caché de búsquedas frecuentes | 100.000 lecturas/día · 1.000 escrituras/día |
| **Workers AI** | Búsqueda semántica, descripciones | 10.000 Neurons/día |
| **Email Routing** | Recibir correo (`hola@logidma.com`) | Ilimitado |
| **Cache API / Rules** | Acelerar respuestas repetidas | Incluido |
| **Web Analytics** | Visitas sin cookies de terceros | Gratis |

**No disponibles en plan gratuito** — exigen Workers Paid ($5/mes):

- **Cloudflare Email Sending** — por eso el correo va por Brevo
- **Durable Objects** — relevante si algún día hace falta estado coordinado

---

## 3. Infraestructura en Cloudflare

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

## 4. Orden de trabajo

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

## 5. Permisos de API token

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

## 6. Base de datos D1 (`morelia`)

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

## 7. Dominio

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

## 8. Autenticación

La sesión es **opcional**: buscar en Atarax no requiere cuenta. Solo hace falta
para guardar favoritos, reseñar o gestionar la ficha de un negocio.

Dos vías, ambas sin contraseñas:

| Vía | Ruta de entrada | Estado |
|---|---|---|
| Enlace mágico por correo | `POST /api/auth/enlace` | Requiere `BREVO_API_KEY` |
| Google OAuth | `GET /api/auth/google` | Requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` |

Ambas convergen en el mismo usuario: **la identidad es el correo**, así que
quien entre una vez por enlace y otra por Google acaba en la misma cuenta.

### 8.1 Rutas

| Ruta | Método | Qué hace |
|---|---|---|
| `/entrar` | GET | Pantalla de acceso |
| `/api/auth/enlace` | POST | Envía el enlace mágico. Limitado por correo e IP |
| `/entrar/verificar?token=` | GET | Canjea el enlace y abre sesión |
| `/api/auth/google` | GET | Redirige a Google con `state` anti-CSRF |
| `/api/auth/google/callback` | GET | Valida `state`, canjea el código, abre sesión |
| `/api/auth/yo` | GET | Estado de sesión, para pintar la cabecera |
| `/api/auth/salir` | POST | Revoca la sesión en servidor |

### 8.2 Decisiones de seguridad

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

### 8.3 Lo que falta configurar

**Correo — se envía por Brevo, no por Cloudflare.**

Cloudflare Email Sending **no está disponible en el plan Workers Free**: exige
Workers Paid ($5/mes). Como el proyecto se mantiene a coste cero, el envío va
por Brevo, cuyo plan gratuito da 300 correos/día — de sobra para un directorio
de barrio.

Pasos, una sola vez:

1. Crear cuenta en Brevo (plan gratuito).
2. Autenticar el dominio `logidma.com` en Brevo y añadir los registros DNS que
   indique. **Ojo**: `logidma.com` ya envía correo por Google Workspace y
   Firebase; los registros de Brevo usan sus propios selectores y no deberían
   chocar, pero revisa antes de aplicar.
3. Crear una clave API y guardarla como secreto:

```bash
npx wrangler secret put BREVO_API_KEY
```

### Cascada de proveedores

`src/auth/correo.js` elige proveedor por disponibilidad:

| Orden | Proveedor | Cuándo actúa |
|---|---|---|
| 1 | Brevo | Si existe `BREVO_API_KEY` — el camino de producción |
| 2 | Binding `EMAIL` de Cloudflare | Solo con Workers Paid; en `wrangler dev` es una simulación que escribe el correo a disco |
| 3 | Log | Último recurso en desarrollo: deja el enlace en consola |

Solo devuelve éxito si un proveedor real aceptó el mensaje. Si ninguno lo
acepta, la API responde `correo_no_configurado` en vez de fingir que envió.

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

### 8.4 Probar en local

`wrangler dev` simula el binding de correo y **escribe el mensaje a disco** en
vez de enviarlo. El enlace está ahí:

```bash
cat .wrangler/tmp/email/*/email-text/*.txt
```

Copia `.dev.vars.example` a `.dev.vars` para apuntar los enlaces a tu servidor
local y probar las credenciales de Google sin tocar producción.

---

## 9. Directrices de diseño

Estas reglas son vinculantes: toda vista nueva de Atarax debe cumplirlas.

### 9.1 Principio rector

Atarax es un directorio **local**. El diseño no es decoración genérica: está anclado
en Morelia. Dos referencias sostienen toda la identidad visual:

- **Cantera rosa** — la piedra volcánica del centro histórico. Es el acento primario.
- **Acueducto** — sus arcos son el motivo gráfico. Aparecen como línea de horizonte,
  nunca como adorno suelto.

Antes de añadir un elemento decorativo, pregúntate si nace de ahí. Si no, sobra.

### 9.2 Color

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

### 9.3 Tipografía

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

### 9.4 Movimiento

Rige la skill `gsap-animation`. Resumen operativo:

- Una **sola línea de tiempo** orquesta la entrada. Nada anima por su cuenta.
- El orden narra: contexto → identidad → pregunta → herramienta → fondo → opciones.
  El acueducto se dibuja **después** del buscador: es escenografía, no protagonista.
- Solapamiento obligatorio (`"-=0.6"`, `"<"`). Retardos apilados están prohibidos.
- Easing `.out` en entradas (`power3.out`, `expo.out`). Nada lineal.
- Solo se animan `transform` y `opacity`.
- `prefers-reduced-motion` salta al estado final. No es opcional.

### 9.5 Forma y espacio

- Radio: `999px` en píldoras (botones, buscador), `--radius` (16px) en tarjetas.
- El espaciado nace de `--gutter` y de `clamp()` ligado al viewport, no de valores fijos.
- Las tarjetas se elevan 3px en hover. Ningún movimiento de hover pasa de eso.

### 9.6 SVG

- Trazo, no relleno: `fill="none"` con `stroke="currentColor"`, grosor `2` a 48px.
- El color se hereda con `currentColor`, para que el token mande.
- Todo SVG decorativo lleva `aria-hidden="true"` y `focusable="false"`.
- Los iconos comparten métrica: mismo viewBox, mismo grosor, misma terminación.

### 9.7 Accesibilidad

Innegociable en cualquier vista:

- Contraste mínimo **4.5:1** en texto; el par `--text` sobre `--bg` lo supera con holgura.
- `:focus-visible` siempre visible, en `--cantera`, con `outline-offset`.
- Todo control sin texto visible lleva `aria-label`.
- El HTML se mantiene legible sin CSS ni JS: encabezados en orden, `label` en cada campo.
- Ningún contenido depende solo del color para entenderse.

---

## 10. Skills incluidas

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

## 11. Convenciones

- **Nunca** commitear secretos. Usar `wrangler secret put` o `.dev.vars`.
- Toda consulta a D1 con `.bind()`; jamás construir SQL por concatenación.
- Animar solo `transform` y `opacity`; nunca `top`/`left`/`width`/`height`.
- Respetar `prefers-reduced-motion` en toda animación.
- Validar con `--dry-run` antes de cada despliegue.
- Ramas de trabajo → PR → merge a `main`.
