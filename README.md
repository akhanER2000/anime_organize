# ANIME VAULT

[![verificar](https://github.com/akhanER2000/anime_organize/actions/workflows/verificar.yml/badge.svg)](https://github.com/akhanER2000/anime_organize/actions/workflows/verificar.yml)

Catálogo personal de anime, multiusuario. Cada usuario tiene su _vault_: sus series, sus
portadas, su progreso y sus enlaces para continuar viendo donde lo dejó.

Obsidiana y oro: una losa de laja negra partida y reparada con kintsugi.

> **Estado: en producción, con el vault del propietario cargado.** Landing, registro y
> recuperación, biblioteca en rejilla y en lista, ficha, buscador global, alta con
> portada, sitios y espejos, enriquecimiento con AniList y Claude, importación de
> `.xlsx`/`.csv`, exportación, borrado de cuenta y móvil.
>
> Lo que falta —y qué hace falta para cada cosa— está en **[Lo que falta](#lo-que-falta-y-qué-hace-falta-para-cada-cosa)**,
> más abajo. Para desplegar paso a paso, `DESPLIEGUE.md`.

---

## Stack

| Área          | Elección                                                     |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 15 (App Router, React Server Components)             |
| Lenguaje      | TypeScript estricto                                          |
| Estilos       | Tailwind CSS v4 con los tokens del diseño en `@theme`        |
| Base de datos | **Neon** (Postgres serverless) — _nunca Supabase_            |
| ORM           | Drizzle ORM + drizzle-kit, driver `@neondatabase/serverless` |
| Auth          | Auth.js v5 (`next-auth@beta`), sesión JWT                    |
| Validación    | Zod (servidor y cliente) + react-hook-form                   |
| Imágenes      | sharp (re-encode a WebP)                                     |
| Excel/CSV     | SheetJS                                                      |
| IA            | `@anthropic-ai/sdk` + AniList GraphQL público                |
| Tests         | Vitest (unidad) + Playwright (e2e)                           |
| Gestor        | **npm**                                                      |

### Por qué npm y no pnpm

El proyecto se diseñó para pnpm, pero en la máquina de desarrollo `corepack enable pnpm`
falla con `EPERM` (no puede escribir en el directorio de Node sin privilegios). En vez de
mezclar dos gestores —que es peor que elegir el que no gusta— **todo el proyecto usa npm**.
Recuerda que **npm necesita `--` para pasar argumentos a un script**:

```bash
npm run seed -- --dry-run     # correcto
npm run seed --dry-run        # el flag se lo come npm
```

---

## Requisitos

- **Node.js ≥ 20.9** (probado en 24.14)
- **npm** (viene con Node)
- Una cuenta en [Neon](https://neon.tech) — el plan gratuito sobra
- Una cuenta en [Vercel](https://vercel.com) para desplegar
- _Opcional:_ clave de [Anthropic](https://console.anthropic.com) para el enriquecimiento con IA
- _Opcional:_ cuenta de [Resend](https://resend.com) para enviar correos

---

## 1 · Crear la base de datos en Neon

1. Entra en [console.neon.tech](https://console.neon.tech) y crea un proyecto.
   Región: la más cercana a la de tu despliegue de Vercel (menos latencia por consulta).
2. Neon crea la rama `production` por defecto. **Crea también una rama `development`**
   (_Branches → New branch_, a partir de `production`). Es donde vas a trabajar: las ramas
   de Neon son copias instantáneas, y romper `development` no cuesta nada.
3. En _Connection Details_ copia **las dos cadenas** de la rama `development`:
   - la **pooled** (lleva `-pooler` en el host) → `DATABASE_URL`
   - la **unpooled** (sin `-pooler`) → `DATABASE_URL_UNPOOLED`

   La _pooled_ es para la aplicación; la _unpooled_ para migraciones y scripts, porque el
   DDL largo no va por el pooler.

### Las extensiones son POR RAMA, no por proyecto

Este proyecto necesita tres extensiones de Postgres:

| Extensión  | Para qué                                               |
| ---------- | ------------------------------------------------------ |
| `citext`   | `users.email` insensible a mayúsculas                  |
| `pg_trgm`  | similitud difusa de títulos (deduplicación) y buscador |
| `unaccent` | búsqueda sin acentos                                   |

**Una rama nueva de Neon nace sin ellas.** Si creas `development`, `production` o cualquier
rama de preview y aplicas las migraciones sin más, la migración `0001` **falla en la primera
columna `citext` de `users`**.

Las crea `drizzle/0000_extensiones.sql`, que se aplica automáticamente como parte de
`npm run db:migrate`. Para comprobar que están:

```sql
SELECT extname FROM pg_extension WHERE extname IN ('citext','pg_trgm','unaccent');
```

Deben salir las tres. Si el rol `neondb_owner` no pudiera crear alguna, **para y dilo**:
rodearlo con `lower()` a mano desactiva la deduplicación insensible a mayúsculas sin avisar.

> `pgcrypto` **no** se usa. Su único uso habría sido `gen_random_uuid()`, que es nativo en
> Postgres desde la versión 13. Las contraseñas se hashean con Argon2id en Node.

---

## 2 · Variables de entorno

Copia la plantilla y rellénala:

```bash
cp .env.example .env.local
```

`.env.local` está en `.gitignore` y **nunca se commitea**. El `.gitignore` usa denegación
total sobre `.env*` con una única excepción para `.env.example`.

| Variable                                | ¿Obligatoria?          | De dónde sale                                                                                                                                                                    |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | **sí**                 | Neon → Connection Details → cadena _pooled_                                                                                                                                      |
| `DATABASE_URL_UNPOOLED`                 | **sí**                 | Neon → la misma sin `-pooler`                                                                                                                                                    |
| `AUTH_SECRET`                           | **sí**                 | `npx auth secret` (uno distinto por entorno)                                                                                                                                     |
| `AUTH_URL`                              | en producción          | la URL real del despliegue                                                                                                                                                       |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`       | no (`false`)           | ponla a `true` al abrir el registro                                                                                                                                              |
| `RESEND_API_KEY`                        | no                     | [resend.com/api-keys](https://resend.com/api-keys)                                                                                                                               |
| `EMAIL_FROM`                            | si usas Resend         | una dirección de tu dominio verificado                                                                                                                                           |
| `ANTHROPIC_API_KEY`                     | no                     | [console.anthropic.com](https://console.anthropic.com)                                                                                                                           |
| `ANTHROPIC_MODEL`                       | no (`claude-sonnet-5`) | —                                                                                                                                                                                |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | **no las lee nadie**   | reservadas: el proveedor de Google **no está cableado**, así que rellenarlas hoy no habilita nada. La política de vinculación ya está decidida y testeada (`security.md` §2 bis) |
| `GOOGLE_DRIVE_*`                        | no                     | espejo opcional de portadas                                                                                                                                                      |
| `SEED_OWNER_EMAIL`                      | para el seed           | tu email                                                                                                                                                                         |

**La cadena de producción no vive en tu disco.** Ni en `.env.local` ni «un momento para
probar algo». Va solo en las variables de Vercel del entorno _Production_. Ver
`.claude/rules/security.md` §7.

### Sobre el correo

La verificación de email y el «olvidé mi contraseña» usan una interfaz desacoplada:

- **Sin `RESEND_API_KEY`** → _driver de consola_: el enlace se imprime en el log del
  servidor con un aviso. La aplicación **funciona igual**; no hace falta clave para
  desarrollar.
- **Con `RESEND_API_KEY`** → se envía de verdad.

`AUTH_REQUIRE_EMAIL_VERIFICATION` está en `false` por defecto: mientras el vault sea de una
sola persona, verificar tu propio email no aporta nada y bloquearía el arranque. Los caminos
de código y sus tests existen igualmente, así que activarlo es cambiar una variable, no
reescribir la autenticación.

> **Plan gratuito de Resend:** 3.000 correos/mes, 100/día, **1 dominio verificado**.
> De sobra para este proyecto. Ojo: hasta verificar un dominio propio solo puedes enviar a
> tu propia dirección, así que abre el registro a terceros _después_ de verificarlo.

---

## 3 · Instalar y arrancar

```bash
npm install
npm run db:migrate     # crea extensiones + esquema en la rama de development
npm run dev            # http://localhost:3000
```

---

## 4 · Cargar tus 83 animes

```bash
npm run seed -- --dry-run    # ensayo: lee y reporta, no escribe
npm run seed                 # de verdad
```

Lee `animes-seed.json`, inserta los animes del usuario propietario
(`SEED_OWNER_EMAIL`) y descarga cada portada desde Drive, pasándola por el mismo pipeline
que `/api/covers`: sha256 → sharp → WebP 82 → 480×720 y 100×150 → `anime_cover`.

Es **idempotente**: se puede correr N veces. Al terminar reporta creados, duplicados
omitidos y fallidos, con el motivo de cada fallo.

---

## 5 · Enriquecer con AniList y Claude

```bash
npm run enrich -- --dry-run        # ensayo: dice a cuántos afectaría y no escribe
npm run enrich                     # solo los que aún no tienen anilist_id (idempotente)
npm run enrich -- --limite 10      # los diez primeros
npm run enrich -- --reanalizar     # también los ya enriquecidos
npm run enrich -- --sin-ia         # solo metadatos, sin gastar en Claude
```

**Paso 1 (AniList)** es público y gratuito: no necesita clave. Concurrencia 3 y espera con
jitter, que es el límite que pide AniList (90 peticiones/minuto).

**Paso 2 (Claude)** necesita `ANTHROPIC_API_KEY`; si falta, **se salta con un aviso** y el
paso 1 sigue funcionando. Eso es comportamiento correcto, no un fallo — la salida lo dice:
`paso 2 (IA): OMITIDO — falta ANTHROPIC_API_KEY (no es un fallo)`.

Y desde la interfaz: cada ficha tiene su botón **«Enriquecer»**, con **«Volver a analizar»**
cuando ya lo está.

---

## 6 · Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: _Add New → Project_ e impórtalo. Framework: Next.js (se detecta solo).
3. **Variables de entorno**, por entorno separado:
   - _Production_ → las cadenas de la rama `production` de Neon, su propio `AUTH_SECRET`.
   - _Preview_ → las de una rama de preview, con **otro** `AUTH_SECRET`.
4. **Antes del primer despliegue a producción**, aplica las migraciones contra la rama
   `production` y comprueba que las tres extensiones existen ahí (§1). Es el fallo típico
   del primer deploy.
5. Despliega.

O usa `/project:deploy`, que hace el checklist previo (typecheck, lint, tokens, tests,
build, escaneo de secretos, extensiones y migraciones) antes de subir nada.

> **Lo pesado de `design/` está excluido** en `.vercelignore`: `assets/`, `screens/`,
> `scripts/` y el `.dc.html` — unos 85 MB de PNG originales que la aplicación no sirve
> nunca. Lo que sí viaja son los cinco ficheros de texto (`tokens.css`, `tokens.json`,
> `DESIGN-SPEC.md` y dos más, ~110 KB): son la fuente de verdad visual y pesan lo que
> pesa un icono.

---

## Lo que falta, y qué hace falta para cada cosa

> **Nada de esto está simulado.** El código está escrito, tipado y con
> tests de todo lo que se puede probar sin credenciales; lo que no está es **ejecutado**,
> porque depende de algo que tiene que aportar el dueño. Se listan aquí y no en un fichero
> de bloqueo aparte: un documento que sólo describe pendientes envejece solo y acaba
> mintiendo; éste se lee.

### 1 · Enriquecimiento masivo desde la interfaz

|                                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué funciona hoy**            | El botón «Enriquecer» de cada ficha, y `npm run enrich` para el lote entero desde la línea de comandos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Qué falta**                   | `POST /api/enrich/batch` con `{ loteId }` y su _polling_, tal como lo describe `.claude/rules/api-conventions.md` § «Procesos largos».                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Por qué no está**             | **No es cuestión de credenciales, es de infraestructura.** En Vercel una función termina cuando devuelve la respuesta: un bucle lanzado en segundo plano muere con ella. Y 83 animes × 2 llamadas a terceros no caben en el tiempo de una sola invocación. Hacerlo «como si» —arrancar el bucle y devolver `{ loteId }`— daría un lote que se corta a la mitad sin decirlo, que es peor que no tenerlo.                                                                                                                                                                                      |
| **Qué hace falta de ti**        | Elegir el mecanismo, porque los tres cuestan cosas distintas: <br>· **Vercel Cron** golpeando un endpoint que procesa un trozo por ejecución. En Hobby son 2 crons y **una ejecución al día**; en Pro, cada minuto. <br>· **Una cola** (Upstash QStash, Inngest). Funciona en Hobby, pero es **otro proveedor que registrar, otro secreto que rotar y otra superficie que auditar** — el mismo criterio con el que se descartó Upstash para el limitador (`security.md` §5). <br>· **Dejarlo en el CLI**, que es lo que hay, y es una respuesta legítima: el lote completo se corre una vez. |
| **Cómo comprobar que funciona** | Con los ojos, no con el recuento: la ficha de un anime enriquecido enseña sus chips `✦`, y `select status, count(*) from ai_job group by status` dice cuántos salieron bien.                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 2 · Espejo de portadas en Google Drive

|                                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué funciona hoy**            | Que no configurarlo **no rompe nada**: la fuente de verdad son los bytes en Postgres y el espejo va _después_ de guardarlos. Sin las variables no se hace nada y no se dice nada — no es una avería.                                                                                                                                                                                                                                                                                                                                                                                     |
| **Qué falta**                   | La subida real **no se ha ejecutado nunca**: no hay cuenta de servicio en este entorno. Está probado todo lo que se decide antes de tocar la red —la configuración, la clave PEM, las reclamaciones del JWT y el cuerpo multiparte—; la llamada viva, cero veces.                                                                                                                                                                                                                                                                                                                        |
| **Qué hace falta de ti**        | 1. Un proyecto en Google Cloud con la **Drive API** habilitada. <br>2. Una **cuenta de servicio** y su clave JSON. <br>3. **Compartir la carpeta de Drive con el correo de esa cuenta de servicio**, con permiso de editor. Éste es el paso que se olvida siempre: una cuenta de servicio tiene su propio Drive, y sin compartir la carpeta la subida falla o el fichero aterriza donde nadie lo ve. <br>4. Las tres variables: `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY` (con los saltos de línea escapados como `\n`; el código los deshace). |
| **Detalle de seguridad**        | El permiso que se pide es `drive.file`, que da acceso **sólo a los ficheros que crea esta aplicación**. Con `drive` a secas, una credencial filtrada abriría tu Drive entero. No lo cambies.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Si pones dos de las tres**    | La aplicación **lo dice** en vez de callarse: «el espejo de Drive está configurado a medias». Media configuración es un fallo, no una preferencia.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Cómo comprobar que funciona** | `npm run seed` termina con `· N en el espejo de Drive`, y `select count(*) from anime_cover where drive_file_id is not null` debe dar ese mismo N. Y después, **abre la carpeta de Drive y míralo**.                                                                                                                                                                                                                                                                                                                                                                                     |

### 3 · Paso 2 del enriquecimiento (Claude)

|                                 |                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué funciona hoy**            | El prompt, el vocabulario cerrado de 26 etiquetas y la validación estricta de la respuesta, con 21 tests: JSON con prosa alrededor, JSON inválido, etiqueta fuera del vocabulario, más de dos propuestas, confianza fuera de `[0,1]`, tono o público inventados, y una respuesta que obedece a una inyección escrita en la sinopsis. Si no valida, **se descarta entera**. |
| **Qué falta**                   | La llamada real. Sin `ANTHROPIC_API_KEY` el paso se omite con aviso y queda registrado en `ai_job` como `OMITIDO`, para que dentro de meses «mi ficha no tiene etiquetas» tenga explicación en alguna parte.                                                                                                                                                               |
| **Qué hace falta de ti**        | `ANTHROPIC_API_KEY` de [console.anthropic.com](https://console.anthropic.com). `ANTHROPIC_MODEL` es opcional y por defecto vale `claude-sonnet-5`.                                                                                                                                                                                                                         |
| **Coste aproximado**            | Una llamada por anime, con la sinopsis dentro: del orden de 1.500 tokens de entrada y 300 de salida. Para los 83, una vez.                                                                                                                                                                                                                                                 |
| **Cómo comprobar que funciona** | `npm run enrich -- --limite 3` debe imprimir `paso 2 (IA): claude-sonnet-5` en lugar de `OMITIDO`, y la ficha debe enseñar chips con el prefijo `✦` y borde punteado. En `ai_job`, filas con `provider = 'ANTHROPIC'`, `status = 'OK'` y sus contadores de tokens.                                                                                                         |

### 4 · Que CI llegue hasta el final

**Dos causas, las dos encontradas leyendo el log entero. Ninguna era la que dije antes.**

> **Este apartado ha mentido dos veces, y las dos las escribí yo.** Primero culpó al
> orden de los pasos; después inventó un dilema de infraestructura con tres opciones.
> Las dos veces **inferí la causa sin leer el error real**. Lo dejo escrito porque el
> error de método vale más que la conclusión: una captura de la anotación de Actions
> valió más que mis dos diagnósticos juntos.

**Causa 1 — un test unitario con base escondida.** `limitador.test.ts` comprobaba que la
guarda ACEPTA `recuperar-nueva:ip:<ip>` llamando a `registrarIntento`, y aceptar
significa seguir hasta el `insert`. Verde en local (Neon real), rojo en CI
(`postgres:18`). **Arreglado:** la comprobación se extrajo a `claveBienFormada()`, pura.
El caso rechazado sigue yendo por `registrarIntento` a propósito — lanza antes de tocar
nada, y así queda cubierto que la guarda está cableada y no solo exportada.

**Causa 2 — un test que desaparecía del recuento.** Con lo anterior arreglado, el paso
seguía saliendo con código 1 mientras el resumen decía «57 passes · 57 total». El log
completo decía otra cosa:

    Test Files  57 passed (58)
    Unhandled Error: [vitest-pool]: Worker forks emitted error.
    Caused by: Error: Worker exited unexpectedly

**Cincuenta y ocho ficheros, cincuenta y siete terminados.** El que faltaba,
`revocacion.camino-real.test.ts`, ni siquiera aparecía en la lista: su worker moría
durante el arranque. Y como vitest no lo contaba ni como pasa ni como falla, **el
resumen se leía igual que un éxito**. Ese es el fallo más peligroso de los tres que han
salido en este proyecto: no un rojo mal explicado, sino un verde que no cubría lo que
parecía cubrir.

**Por qué moría.** Ese test arranca la aplicación de verdad (`next build` +
`next start`), y la aplicación usa el driver HTTP de Neon —`src/lib/db/interno.ts`, no
configurable— que necesita un endpoint `https://<host>/sql` que un contenedor no tiene.
Los demás tests contra base no sufren esto porque van por `cliente-test.ts`, que elige
`pg` cuando el destino no es Neon.

**Arreglado declarando el requisito.** El fichero ya sabía omitirse en voz alta cuando le
faltaba la base; ahora también cuando la base existe pero **la aplicación no puede
usarla**, con el mismo aviso de siempre: _«omitirlo NO es aprobarlo»_. La pregunta tiene
un solo dueño, `src/lib/db/motor.ts`, que además retiró las **cuatro copias** de
`esNeon` que andaban sueltas.

**Causa 3 — la misma, un piso más arriba.** Con el camino real ya declarado, el paso
siguiente falló con **diez** errores `NeonHttpPreparedQuery`: los tests de integración
ejercitan código real de la app —`src/lib/db/cuentas.ts`— y ese código va por el mismo
driver HTTP. No era un test mal escrito: **la capa de datos de la aplicación estaba
clavada a Neon**, y cualquier test que ejercite código real contra una base lo notaba.

**Resuelto poniendo un traductor, no cambiando de driver.** CI levanta ahora un segundo
servicio, un proxy que habla el protocolo HTTP de Neon por delante y Postgres por detrás.
`NEON_HTTP_PROXY` manda el driver hacia él; en producción esa variable no existe y no se
ejecuta ni una línea nueva.

Se eligió frente a la alternativa —que `dbInterna()` cambiara a `pg` contra un Postgres
normal— por una razón concreta: así CI ejecuta **el mismo driver que producción**, en vez
de verificar una variante. Y porque `batch()` no tiene equivalente fiel en `pg`: las
consultas de drizzle vienen atadas a su cliente, meterlas en un `transaction()` no las
reata, y se perdería la atomicidad justo en la capa donde importa. Habría sido, otra vez,
un verde que no cubre lo que parece cubrir.

La imagen va **fijada por digest** y no por etiqueta: es de terceros y esto es un
repositorio público, así que con etiqueta móvil quien controle ese registro decidiría qué
corre aquí. Con digest, actualizarla es un commit visible. Solo vive dentro del runner.

### 5 · Envío de correo (recuperación y verificación)

|                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué funciona hoy**                               | El ciclo entero de recuperación, verificado en navegador: pedir el enlace, restablecer **y entrar después** con la contraseña nueva. Lo único que no ocurre es el envío.                                                                                                                                                                                                                                                              |
| **Qué falta**                                      | `RESEND_API_KEY` y `EMAIL_FROM`. **Procedimiento entero en `DESPLIEGUE.md` § Paso 7**, incluido el atajo de cinco minutos que sirve para TUS propios cambios de contraseña sin verificar dominio. Sin ellas actúa el _driver de consola_: el correo **se imprime en el log del servidor**, en un recuadro que empieza por `CORREO NO ENVIADO — driver de consola` y lleva el destinatario, el asunto y el texto con el enlace dentro. |
| **Cómo recuperar la cuenta HOY, si te hace falta** | Pide el enlace en `/recuperar` y sácalo de **Vercel → tu proyecto → Logs**, buscando `CORREO NO ENVIADO`. Caduca en **1 hora** y es de un solo uso.                                                                                                                                                                                                                                                                                   |
| **Qué hace falta de ti**                           | Una clave de [resend.com/api-keys](https://resend.com/api-keys) y una dirección `EMAIL_FROM` de un dominio verificado allí.                                                                                                                                                                                                                                                                                                           |
| **La trampa del plan gratuito**                    | Hasta que verifiques un dominio propio, Resend **sólo te deja enviar a tu propia dirección**. Basta para un vault de una persona; si algún día abres el registro, verifica el dominio antes.                                                                                                                                                                                                                                          |
| **Cómo comprobar que funciona**                    | No con «el formulario responde 200». **Completa el ciclo**: pide el enlace, ábrelo desde tu buzón, cambia la contraseña **y entra con la nueva**. Comprobar sólo la primera mitad es exactamente el fallo que llegó a producción una vez en este proyecto.                                                                                                                                                                            |

---

## Comandos

```bash
npm run dev · build · start

# ── Las siete puertas de calidad, encadenadas en `lint:todo` ──────────────
npm run lint:scripts     # cada script de package.json apunta a un fichero que existe
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run lint:tokens      # falla si hay un hex fuera de globals.css
npm run lint:duplicados  # cuenta recetas de clases repetidas; falla si el número SUBE
npm run lint:spread      # falla si un {...spread} va detrás de lo que el componente calcula
npm run lint:contrato    # escribe 12 intentos de saltarse el contrato de datos y exige que fallen
npm run lint:todo        # los siete de arriba, en orden

npm run test             # vitest, SIN los de integración (no necesita base)
npm run test:integracion # solo los de integración: exigen Postgres real
npm run test:todo        # los dos anteriores juntos
npm run test:cov         # con cobertura
npm run test:e2e         # playwright, contra `build` + `start`

npm run db:generate      # genera la migración desde el esquema TS
npm run db:migrate       # aplica migraciones (anuncia su destino antes de escribir)
npm run db:push          # SOLO desarrollo local. Jamás contra producción.
npm run db:studio        # drizzle-studio
npm run db:verificar     # compara el esquema real contra el declarado

# ── Lo que se ejecuta antes de decir «terminado» ──────────────────────────
npm run verificar:rapido # lint:todo + test:unit
npm run verificar        # lint:todo + test:unit + build + test:integracion
npm run verificar:todo   # lo anterior + test:e2e
```

> **El exit code es el resultado.** No se encadenan con `echo`, no se enmascaran con
> `|| true` y no se lee sólo la última línea: en una tubería el estado es el del último
> comando, así que un `| tail -5 && echo OK` imprime «OK» sobre un `tsc` que falló. Pasó.
> La regla completa está en `.claude/rules/testing.md`.

---

## Estructura

```
design/          el diseño aprobado — fuente de verdad visual (no se toca)
drizzle/         migraciones SQL, generadas y revisadas a mano
scripts/         seed, enrich, migrate, lint-tokens
src/
  app/           rutas (App Router) y route handlers
  components/    ui/ · anime/ · layout/
  lib/
    db/          cliente Neon, esquema, repositorios, propiedad por user_id
    domain/      reglas PURAS: normalizar, duplicados, progreso, enums
    validation/  esquemas Zod compartidos cliente/servidor
    covers/      pipeline de portadas
    enrich/      AniList + Claude
.claude/         reglas, comandos, subagentes y skills del proyecto
```

`src/lib/domain/` no importa nada de `db/`, `app/` ni React: es lógica pura y testeable
sin arrancar nada.

---

## Documentación del proyecto

| Dónde                                | Qué                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                          | stack, comandos, arquitectura, catálogo de skills                                                    |
| `.claude/rules/`                     | normas: estilo, tests, API, tokens, BD, seguridad                                                    |
| `.claude/skills/anime-vault-domain/` | **las reglas de dominio**: normalización de títulos, deduplicación, progreso, portadas, etiquetas IA |
| `design/DESIGN-SPEC.md`              | medidas, estados de componente y breakpoints                                                         |
| `tasks/`                             | especificaciones por fase                                                                            |
