# Desplegar Anime Vault

> **Objetivo de este documento:** que entres en una URL real y veas tus 83 animes.
>
> Lo que hay debajo está pensado para copiar y pegar. Cada paso dice **quién** lo hace.
> Los que llevan una cadena de conexión de producción son **tuyos**, siempre: esa cadena
> no pasa por el chat ni se escribe en ningún fichero de este disco
> (`.claude/rules/security.md` §7).

---

## Antes de nada: qué está listo y qué no

|                                                           | Estado                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| La aplicación compila **sin ninguna variable de entorno** | ✅ medido, `exit 0`                                                             |
| Migraciones (4, incluidas las extensiones)                | ✅ en el repositorio, con journal                                               |
| Seed de los 83 animes **con sus portadas**                | ✅ probado: 83 portadas, 3,0 MB, descargadas de Drive desde esta máquina        |
| CSP con nonce por petición                                | ✅ ya en `src/middleware.ts`, funciona en producción                            |
| Rutas dinámicas                                           | ✅ todas `ƒ`, no hay nada prerenderizado que necesite datos                     |
| `/dev/*`                                                  | ✅ responde **404 en producción** por diseño                                    |
| Añadir un anime                                           | ❌ **no existe todavía**. El botón se pinta deshabilitado y dice «próximamente» |
| Correo (Resend)                                           | ➖ opcional. Sin clave, el enlace se imprime en el log                          |

**Lo que vas a poder hacer el primer día:** entrar, ver tu biblioteca en rejilla y en lista,
filtrar, ordenar, abrir la ficha de cada anime y usar el enlace de «continuar viendo».
**Lo que no:** añadir, editar ni borrar animes.

---

## Paso 0 · Que lo que quieres desplegar esté **en `origin`**

> **Vercel no despliega tu disco. Despliega `origin/main`.**
>
> Este paso no estaba en la primera versión de este documento, y por eso el primer
> despliegue sirvió un commit anterior a las cuatro pantallas: la aplicación estaba
> escrita, probada y verde, y **nada se había commiteado**. Todo en verde,
> apuntando al sitio equivocado.

```bash
cd /j/Code/Anime_Organize/anime-vault
git fetch --quiet origin
git status --short
git rev-list --left-right --count origin/main...HEAD
```

- `git status --short` **no debe imprimir nada**.
- El contador debe dar **`0	0`**: ni commits que te faltan, ni commits sin subir.

Si sale algo, súbelo antes de seguir. Y cuando Vercel termine, comprueba que el
`githubCommitSha` del despliegue es el de `origin/main`:

```bash
git --no-pager log --format=%H -1 origin/main
```

---

## Paso 0 bis · Comprueba que el repositorio público no lleva secretos

**Lo haces tú, aquí, antes de conectar nada.** El repositorio es público.

```bash
cd /j/Code/Anime_Organize/anime-vault
git status --porcelain
git check-ignore -v .env.local CLAUDE.local.md .claude/settings.local.json e2e/.sesion-propietario.json
```

Las cuatro rutas del segundo comando tienen que aparecer **ignoradas**. Si alguna no sale,
para y dímelo.

---

## Paso 0 ter · El ciclo de recuperación, entero

```bash
npx playwright test e2e/recuperar-y-entrar.spec.ts --project=chromium
```

Los dos recorridos tienen que pasar: registrarse → restablecer → **entrar**, y
bloquearse → restablecer → **entrar**.

No se salta. Es el único flujo cuyo fallo te deja sin forma de arreglarlo desde
dentro: si no puedes entrar, no puedes usar la aplicación para recuperar el
acceso. Llegó roto a producción porque se dio por bueno con que las pantallas
devolvieran 200.

---

## Paso 1 · La rama `production` de Neon

**Lo haces tú, en console.neon.tech.**

Hoy esa rama está vacía. Necesitas sus **dos** cadenas de conexión:

1. Entra en tu proyecto → **Branches** → `production`.
2. **Connection Details**. Arriba a la derecha hay un selector de rama: asegúrate de que
   dice `production` y **no** `development`.
3. Copia las dos:
   - **Pooled** — el host lleva `-pooler`. Es la que usa la aplicación.
   - **Direct** (o _unpooled_) — el mismo host **sin** `-pooler`. Es la que usan las
     migraciones, porque el DDL largo no pasa por el pooler.

> Tu rama `development` está en **us-east-2**. La de producción estará en la misma región,
> y `vercel.json` ya fija `cle1` (Cleveland, us-east-2) para que la función y la base estén
> pegadas. Si Vercel se quejara de esa clave, borra el fichero: es una optimización, no un
> requisito.

---

## Paso 2 · Migrar `production`

**Lo haces tú, en Git Bash.** La cadena va **en línea, solo para ese comando** — nunca
exportada a la sesión ni escrita en `.env.local`.

```bash
cd /j/Code/Anime_Organize/anime-vault
DATABASE_URL_UNPOOLED='PEGA-AQUI-LA-DIRECTA-DE-PRODUCTION' npm run db:migrate
```

**Antes de aplicar nada, el script imprime a dónde va.** Léelo:

```
══════════════════════════════════════════════════════════════════════
  DESTINO: ep-XXXX.c-5.us-east-2.aws.neon.tech · base "neondb"
  DATABASE_URL_UNPOOLED, pasada en la línea de comandos
══════════════════════════════════════════════════════════════════════
```

Tiene que decir **«pasada en la línea de comandos»**. Si dice «leída de un fichero .env»,
está apuntando a desarrollo: corta con `Ctrl+C`.

Esto aplica las cuatro migraciones en orden. La primera, `0000_extensiones`, crea `citext`,
`pg_trgm` y `unaccent`, **que son por rama**: una rama nueva nace sin ellas y sin ellas la
segunda migración falla en la primera columna.

<details>
<summary>Si prefieres PowerShell</summary>

PowerShell no tiene prefijo en línea, así que hay que poner la variable y **quitarla
después**, o se queda en la sesión:

```powershell
$env:DATABASE_URL_UNPOOLED = 'PEGA-AQUI-LA-DIRECTA-DE-PRODUCTION'
npm run db:migrate
Remove-Item Env:\DATABASE_URL_UNPOOLED
```

</details>

---

## Paso 3 · Comprobar que el esquema quedó bien

**Lo haces tú.** Cuesta cinco segundos y evita descubrir en Vercel que falta una extensión.

```bash
DATABASE_URL_UNPOOLED='PEGA-AQUI-LA-DIRECTA-DE-PRODUCTION' npm run db:verificar
```

Tiene que terminar en `Esquema verificado: todo correcto.` Comprueba las extensiones de
verdad —no que existan: que **funcionen**—, las tablas, los índices y que el journal casa
con lo aplicado.

---

## Paso 4 · Sembrar tus 83 animes

**Lo haces tú.** Aquí eliges **la contraseña con la que vas a entrar en la aplicación
desplegada**. No reutilices ninguna real.

Primero en seco, que no escribe nada:

```bash
DATABASE_URL='PEGA-AQUI-LA-POOLED-DE-PRODUCTION' \
SEED_OWNER_EMAIL='castrolorenzosegundo@gmail.com' \
SEED_OWNER_PASSWORD='LA-QUE-ELIJAS' \
npm run seed -- --dry-run
```

Lee la cabecera `DESTINO:` otra vez. Si es la de producción y dice «pasada en la línea de
comandos», repite **sin** `-- --dry-run`:

```bash
DATABASE_URL='PEGA-AQUI-LA-POOLED-DE-PRODUCTION' \
SEED_OWNER_EMAIL='castrolorenzosegundo@gmail.com' \
SEED_OWNER_PASSWORD='LA-QUE-ELIJAS' \
npm run seed
```

### Sobre las portadas — tu pregunta 3

**No salen de una carpeta local: se descargan de Google Drive durante el seed.** Cada
entrada de `animes-seed.json` lleva un `portada.directUrl` que apunta a
`drive.google.com/uc?export=download&id=…`, y las 83 lo tienen.

**Y sí, funciona desde aquí: ya está hecho contra `development`** — 83 animes con 83
portadas, 3,0 MB en la base. El seed las baja de ocho en ocho por el **mismo pipeline que
`/api/covers`** (validación SSRF, límite de 8 MB, magic bytes, re-encode a WebP 82 con
sharp), así que lo que se guarda son bytes ya inspeccionados, no lo que sirva Drive.

Tarda unos minutos. Un fallo de portada **no tumba el seed**: el anime queda creado y se
sirve con el placeholder de laja. Al final lista los que fallaron, y **volver a ejecutarlo
es seguro** — es idempotente y no re-descarga lo que ya tiene checksum.

Si Drive te diera problemas, `npm run seed -- --sin-portadas` carga los 83 animes sin
imágenes y las portadas se pueden reintentar después con otra pasada normal.

---

## Paso 5 · Crear el proyecto en Vercel

**Lo haces tú, en vercel.com.**

**Nombre que propongo: `anime-vault-kintsugi`** → `https://anime-vault-kintsugi.vercel.app`

(`anime-vault` a secas casi seguro está cogido: el subdominio `.vercel.app` es global.
Si el que propongo también lo estuviera, elige otro y **usa el que salga** en el paso
siguiente, que es lo único que importa.)

1. **Add New → Project** → importa el repositorio de GitHub.
2. Framework: Next.js (lo detecta solo). **No toques** _Build Command_ ni _Output Directory_.
3. **Antes de pulsar Deploy**, despliega _Environment Variables_ y pega las de la tabla de
   abajo. Si prefieres desplegar primero y añadirlas después, también vale: el build
   funciona sin ellas, pero la aplicación no servirá hasta que las pongas y **redespliegues**.

### Las variables, exactamente

Todas en el entorno **Production**.

| Variable                          | Valor                                     | De dónde sale                                                             |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                    | la cadena **pooled** de `production`      | Neon → Branches → `production` → Connection Details → _Pooled connection_ |
| `AUTH_SECRET`                     | uno **nuevo**, distinto del de desarrollo | ejecuta `npx auth secret` y copia lo que imprime                          |
| `AUTH_URL`                        | `https://anime-vault-kintsugi.vercel.app` | la URL real que te dé Vercel, sin barra final                             |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false`                                   | fijo. Eres el único usuario y no hay correo configurado                   |

**Y ya está. Cuatro.** Todo lo demás es opcional y hoy no hace falta:

| No la pongas                                     | Por qué                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL_UNPOOLED`                          | **nada en runtime la usa.** Solo migraciones y scripts, que corren desde tu máquina                                    |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`       | son del comando `seed`, que no corre en Vercel                                                                         |
| `RESEND_API_KEY` / `EMAIL_FROM`                  | sin ellas el enlace se imprime en el log, que es lo que decidiste                                                      |
| `ANTHROPIC_API_KEY`                              | **opcional.** El enriquecimiento SÍ está construido; sin clave, el paso 1 (AniList) funciona y el 2 se salta con aviso |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`          | el proveedor no está cableado                                                                                          |
| `GOOGLE_DRIVE_*`                                 | el espejo es opcional y la base es la fuente de verdad                                                                 |
| `RATE_LIMIT_ENABLED`                             | **déjala sin poner.** Sin valor viene ENCENDIDA, que es como tiene que ir                                              |
| `AUTH_VENTANA_CHEQUEO_SEGUNDOS`, `AUTH_SESION_*` | escotillas de test. Sin valor usan los de producción: 60 s de caché de lectura, 12 h / 30 días de sesión               |

> **`AUTH_SECRET` distinto del de desarrollo, en serio.** Compartirlo significa que un token
> emitido en tu portátil vale en producción.

---

## Paso 6 · Desplegar y entrar

1. **Deploy**. El build tarda un par de minutos.
2. Si añadiste las variables después del primer despliegue, ve a **Deployments → … →
   Redeploy**: las variables de entorno solo se aplican en un build nuevo.
3. Abre `https://TU-URL/login`.
4. Entra con `castrolorenzosegundo@gmail.com` y la contraseña que elegiste en el paso 4.
5. Deberías caer en `/app` con tus 83 animes y sus portadas.

---

## Paso 7 · Encender el correo de verdad

Hasta aquí el correo **no sale**: se imprime en el log. Eso fue una decisión, no un
olvido — la app entera funciona sin credenciales. Este paso lo cambia.

> **La clave no pasa por el chat ni por tu disco.** Va en Vercel → Settings →
> Environment Variables → **Production**, y en ningún otro sitio. Ni `.env.local`, ni
> `.env.production`, ni «pegada un momento para probar». Misma regla que la cadena de
> Neon.

### 7.1 · Saca la clave

En [resend.com/api-keys](https://resend.com/api-keys), crear cuenta y generar una clave.
Empieza por `re_`. Permiso de **envío** basta; no hace falta acceso total.

### 7.2 · Elige remitente — y aquí está la decisión

`EMAIL_FROM` tiene dos caminos, y **no cuestan lo mismo**:

|                             | `onboarding@resend.dev`                              | Dominio propio verificado                      |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| **Qué hay que hacer**       | nada, existe ya                                      | verificar el dominio en Resend (registros DNS) |
| **A quién puedes escribir** | **solo a la dirección dueña de la cuenta de Resend** | a cualquiera                                   |
| **Te sirve para**           | **tus propios cambios de contraseña**                | abrir el registro a terceros                   |
| **Tiempo**                  | cinco minutos                                        | lo que tarde tu DNS                            |

Si lo que quieres es que **a ti** te lleguen los enlaces de recuperación, el primero
basta y se hace hoy. El segundo solo hace falta el día que
`AUTH_REQUIRE_EMAIL_VERIFICATION=true` y entre gente que no eres tú.

### 7.3 · Ponlas y **redespliega**

Las dos variables, en Production:

    RESEND_API_KEY=re_...
    EMAIL_FROM=onboarding@resend.dev

Y después **Deployments → ⋯ → Redeploy**. Guardar la variable no basta: un build ya
hecho no las ve (esto ya está dicho en el Paso 6, y es el motivo número uno de «lo puse
y sigue sin funcionar»).

### 7.4 · Comprueba que salió, sin adivinar

Pide un enlace en `/recuperar` y mira **Vercel → Logs**:

- si sigue apareciendo `CORREO NO ENVIADO — driver de consola` → las variables no
  llegaron al build. Redespliega.
- si aparece `[email] Resend respondió` con un **4xx** (403 es el habitual) → la clave
  es válida pero el envío no: dominio sin verificar, o estás escribiendo a una dirección
  que no es la dueña de la cuenta. Reintentar no lo arregla — el módulo solo reintenta
  lo temporal, y esto no lo es.
- **si no aparece ninguna de las dos líneas** → salió. El log solo habla cuando algo
  va mal o cuando el driver es el de consola.

---

## Si algo no sale

| Síntoma                                        | Qué mirar                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La biblioteca sale **vacía**                   | El seed fue a la rama equivocada. Vuelve al paso 4 y lee la cabecera `DESTINO:`                                                                                |
| **500** al entrar                              | Falta `DATABASE_URL` o apunta a una rama sin migrar. Vercel → Logs                                                                                             |
| El login **no avanza** y vuelve a `/login`     | `AUTH_SECRET` sin poner, o `AUTH_URL` que no coincide con el host desde el que entras                                                                          |
| «Correo o contraseña incorrectos» con la buena | El seed creó la cuenta con **otra** contraseña. Vuelve a correrlo con la que quieras: si la cuenta ya existe **no** la cambia, así que bórrala en Neon primero |
| La página se ve **en blanco**                  | Sería la CSP. Mira la consola del navegador y mándame lo que diga: eso ya pasó una vez y tiene test                                                            |
| Las portadas salen como **laja negra**         | Esos animes se quedaron sin portada. Vuelve a correr el seed: solo baja las que faltan                                                                         |
| Vercel rechaza `vercel.json`                   | Borra el fichero y redespliega. Solo fija la región                                                                                                            |

---

## Lo que queda para después de que esto funcione

- **Artboard 06** — añadir un anime. Los cimientos (dominio de duplicados, esquema Zod,
  contrato visual) ya están escritos; falta la pantalla.
- **Los 26 conceptos duplicados** del barrido, en una sola pasada cuando el 06 esté hecho.
- **El barrido de agregados calculados en JavaScript** sobre consultas con tope.
- **Resend + dominio verificado**, el día que quieras que los correos salgan de verdad.
