# Regla · Seguridad

Anime Vault es multiusuario. La regla que domina a todas las demás:
**ninguna consulta cruza usuarios, nunca, por ningún motivo.**

## 1. Propiedad por `user_id`

Toda tabla de datos del usuario cuelga de `users.id` directa o transitivamente:

```
users
 └── anime (user_id)
      ├── anime_cover (anime_id)
      ├── anime_genre (anime_id)
      ├── progress   (anime_id)
      └── continue_link (anime_id)
 ├── import_job (user_id)
 ├── ai_job     (user_id)
 └── streaming_site (user_id, cuando is_global = false)
```

### Contrato obligatorio de toda query

- **Lectura directa de `anime`:** el `WHERE` incluye `eq(anime.userId, session.user.id)`.
  No hay excepción "solo para contar", "solo para el sitemap" ni "solo en el seed".
- **Lectura de tablas hijas** (`anime_cover`, `progress`, `continue_link`, `anime_genre`):
  se llega a ellas **siempre** mediante un `JOIN`/subconsulta contra `anime` filtrado por
  `user_id`. Nunca `WHERE anime_id = ?` a pelo con un id que venga del cliente.
- **Mutaciones:** se comprueba la propiedad **antes** de mutar, en la misma transacción
  cuando sea posible. El patrón canónico vive en `src/lib/db/ownership.ts`:

```ts
// Devuelve el anime o lanza NotFoundError. Nunca devuelve un anime de otro usuario.
const target = await requireOwnedAnime(tx, { animeId, userId: session.user.id });
```

- **Nunca "404 vs 403".** Si un recurso existe pero es de otro usuario, se responde **404**.
  Un 403 confirma la existencia del recurso y filtra información.

### Prohibiciones

- Prohibido `db.query.anime.findFirst({ where: eq(anime.id, id) })` sin `userId`.
- Prohibido pasar `userId` desde el cliente (body, query, header, cookie propia).
  El `userId` sale **siempre** de `auth()` en el servidor.
- Prohibido `SELECT *` sobre `users` en cualquier respuesta: `password_hash` no sale nunca
  del servidor. Usa las proyecciones de `src/lib/db/projections.ts`.

## 2. Autenticación

- Hash de contraseña: **Argon2id** (`@node-rs/argon2`), parámetros `m=19456, t=2, p=1`.
  Fallback documentado: bcrypt con `rounds >= 12`. Nunca MD5, SHA-1 ni SHA-256 pelado.
- Sesión **JWT** de Auth.js v5. El JWT lleva `sub` (uuid del usuario) y nada sensible.
- Comparación de contraseñas y de tokens: **siempre en tiempo constante**
  (`argon2.verify`, `crypto.timingSafeEqual`). Nunca `===` sobre un secreto.
- Tokens de un solo uso (verificación de email, reset de contraseña):
  - se generan con `crypto.randomBytes(32)`,
  - se guarda **solo el hash** (`sha256`) en `password_reset_tokens.token_hash`,
  - caducan a **1 hora**,
  - se marcan `used_at` en la misma transacción en que se consumen,
  - un token usado o caducado responde **exactamente igual** que uno inválido.
- **Enumeración de usuarios:** `/registro`, `/login` y `/recuperar` responden con el mismo
  mensaje y en un tiempo comparable exista o no la cuenta.
- Al cambiar contraseña o email: **re-autenticación obligatoria** (pedir la contraseña actual).

## 2 bis. Vinculación de cuentas OAuth

> **Decidido y cerrado antes de que exista el proveedor de Google**, porque
> retrofitear esta política es caro y equivocarse aquí es un secuestro de cuenta.
> El esquema ya está preparado: `accounts` completa con `UNIQUE (provider, provider_account_id)`.

### La regla

**La vinculación de una cuenta OAuth a un usuario existente solo se permite desde
Ajustes, con sesión ya iniciada. Nunca automáticamente por coincidencia de email.**

### Por qué

Auth.js v5, si el proveedor no está marcado como `allowDangerousEmailAccountLinking`,
corta el login con el error **`OAuthAccountNotLinked`** cuando llega un perfil de OAuth
cuyo email ya pertenece a un usuario que no tiene ese `account` vinculado. Ese
comportamiento es **correcto y se conserva**.

El ataque que evita: cualquiera que consiga crear una cuenta en el proveedor con
`castrolorenzosegundo@gmail.com` —o un proveedor que no verifique el email que emite—
entraría directamente en el vault existente sin conocer la contraseña. La coincidencia de
email **no es una prueba de identidad**: solo lo es si confías en que el proveedor verificó
ese email, y esa confianza no se delega por defecto.

### Qué significa en la práctica

| Situación | Comportamiento |
|---|---|
| Email nuevo entra con Google | Se crea un usuario nuevo con su fila en `accounts`. |
| Email **ya registrado con contraseña** entra con Google | **Se bloquea** con `OAuthAccountNotLinked`. Se le explica en español que inicie sesión con su contraseña y vincule Google desde Ajustes. |
| Usuario con sesión pulsa «Vincular Google» en Ajustes | Se permite: hay prueba de posesión de la cuenta (la sesión) **y** del proveedor (el flujo OAuth). |
| Usuario intenta desvincular su **único** método de acceso | **Se bloquea.** Nunca se deja una cuenta sin forma de entrar: o queda `password_hash`, o queda al menos otro `account`. |

### Prohibido

- **`allowDangerousEmailAccountLinking: true`.** El nombre lo dice. No se activa «solo para
  desarrollo»: acaba en producción.
- Vincular buscando por email en un callback de `signIn`. Es el mismo agujero escrito a mano.
- Mostrar «ese email ya existe» en la pantalla de login OAuth: enumera usuarios. El mensaje
  es genérico y la explicación concreta llega por email al titular.

### Se testea aunque el proveedor esté apagado

`src/lib/auth/vinculacion.test.ts` fija esta política con el proveedor de Google
**desactivado**, para que el día que se encienda no haya que recordar la decisión: si
alguien añade `allowDangerousEmailAccountLinking` o una vinculación por email, el test se
pone en rojo.

## 3. Borrado de cuenta

Flujo no negociable, en este orden:

1. Rate limit específico (3 intentos / hora / usuario).
2. **Re-autenticación** con la contraseña actual.
3. Confirmación escribiendo **el email exacto** de la cuenta.
4. **Export automático** `.json` que se descarga **antes** de borrar nada.
5. Borrado real en cascada (`ON DELETE CASCADE` en el esquema, no borrado lógico) dentro de
   una transacción: anime, portadas, géneros, progreso, enlaces, sitios propios, jobs, sesiones.
6. Invalidación de la sesión.

No se deja "papelera" ni copia de sombra en la BD. `users.deleted_at` existe para
desactivaciones administrativas, **no** para simular el borrado que el usuario pidió.

## 4. SSRF en `/api/covers` — el punto más peligroso de la app

El endpoint acepta una URL del usuario y la descarga desde el servidor. Es un SSRF de
libro si se implementa mal. Checklist obligatorio, en orden:

1. **Esquema:** solo `https:` y `http:`. Nada de `file:`, `data:`, `gopher:`, `ftp:`, `blob:`.
2. **Parseo estricto:** `new URL(input)`. Rechaza credenciales embebidas (`user:pass@host`).
3. **Resolución DNS explícita** con `dns.promises.lookup(hostname, { all: true })`
   **antes** de conectar.
4. **Bloqueo de rangos privados sobre las IPs resueltas** (todas, no solo la primera):
   - IPv4: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16` (incluye el metadata de
     nube `169.254.169.254`), `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`,
     `224/4`, `240/4`, broadcast.
   - IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, y los mapeados a IPv4
     (`::ffff:a.b.c.d`) que se re-validan como IPv4.
5. **Pin de la IP validada:** se conecta a la IP comprobada (`lookup` propio en el agente),
   no al hostname otra vez. Esto cierra el **DNS rebinding**.
6. **Redirecciones:** `redirect: "manual"`, máximo **3** saltos, y **cada salto vuelve a pasar
   por los pasos 1–5**. Un 302 hacia `127.0.0.1` es el bypass clásico.
7. **Timeout de 10 s** (`AbortSignal.timeout(10_000)`).
8. **Tamaño máximo 8 MB**, comprobado por *streaming* (contador de bytes que aborta), no
   confiando en `Content-Length`.
9. **Tipo:** solo `image/jpeg`, `image/png`, `image/webp`, `image/avif`. Se valida por
   **magic bytes** además de por `Content-Type` (una cabecera es texto que el atacante controla).
10. **Re-encode obligatorio con sharp.** Nunca se guarda el binario original: sharp normaliza a
    WebP y de paso destruye cualquier payload (SVG con script, polyglot, EXIF con datos).
    `sharp(...).rotate()` para respetar EXIF y `.withMetadata(false)` para no propagar GPS.
11. **Nada de mensajes de error que filtren la red interna.** El cliente recibe
    `IMAGEN_NO_DESCARGABLE`, jamás `ECONNREFUSED 10.0.0.5:8080`.

La implementación vive en `src/lib/covers/fetch-remote.ts` y tiene tests unitarios de cada
bypass conocido. **Si tocas ese archivo, se pasa `security-auditor` antes de cerrar.**

## 5. Rate limiting

Todo endpoint que consuma recursos o permita adivinar credenciales lleva límite.
Implementación en `src/lib/rate-limit.ts` (token bucket; en memoria en dev, Postgres o
Upstash en producción — configurable, nunca solo memoria en serverless).

| Ruta | Límite | Clave |
|---|---|---|
| `POST /api/auth/login` | 5 / 15 min | IP + email |
| `POST /api/registro` | 5 / hora | IP |
| `POST /api/recuperar` | 3 / hora | IP + email |
| `POST /api/covers` | 30 / hora | userId |
| `POST /api/enrich` | 60 / hora | userId |
| `POST /api/enrich/batch` | 2 / hora | userId |
| `POST /api/import` | 5 / hora | userId |
| `DELETE /api/cuenta` | 3 / hora | userId |
| `POST /api/sitios/comprobar` | 10 / hora | userId |

Respuesta al superarlo: **429** con `Retry-After` y el código `LIMITE_EXCEDIDO`.

### Por qué Postgres y no memoria

**En serverless un contador en memoria no limita nada.** Cada invocación puede caer en una
instancia distinta —y en otra región—, así que «5 intentos» se convierte en «5 intentos por
instancia», y las instancias se crean bajo demanda. El almacén es `rate_limit_bucket` en la
misma base de Neon.

Se descartó un servicio aparte (Upstash, Vercel KV): otro proveedor que registrar, otro
secreto que rotar y otra superficie que auditar, para algo que la base que ya tenemos
resuelve con una tabla. La latencia extra frente a Redis es irrelevante en un login, que ya
va a consultar la base para verificar la contraseña.

### Forma de la tabla

**Una fila por (clave, ventana), no una por intento.** El contador se incrementa con un
`INSERT … ON CONFLICT DO UPDATE … RETURNING` atómico: una sola ida y vuelta, sin
leer-modificar-escribir y por tanto sin carrera entre invocaciones concurrentes. Una tabla
de intentos individuales crecería una fila por cada petición de login del mundo, que es
justo lo que un atacante quiere provocar.

Limpieza **oportunista** (un `DELETE` ocasional aprovechando otra llamada), no un cron: si
un día no se ejecuta, lo único que pasa es que sobran filas muertas, no que el límite deje
de funcionar.

### Ventana deslizante, no fija

Una ventana fija deja pasar **el doble en el borde**: 5 intentos a las 14:59 y 5 más a las
15:01 son 10 en dos minutos. Se cuenta también la ventana anterior, ponderada por lo que le
queda:

```
usado = contadorAnterior * solapamiento + contadorActual
```

Cuesta lo mismo (una fila por ventana) y cierra el borde.

### Dos claves independientes, no una

Login, recuperación y reenvío se limitan por **email Y por IP por separado**:

- por **email** → frena la fuerza bruta contra UNA cuenta aunque el atacante rote IPs, que
  es barato;
- por **IP** → frena el barrido de MUCHAS cuentas desde un mismo origen, y el registro
  masivo de cuentas basura.

Solo email deja pasar el barrido; solo IP deja pasar la fuerza bruta distribuida.
Se registran **ambas** aunque una ya haya bloqueado: cortocircuitar dejaría el contador de
la otra clave sin avanzar y un atacante podría mantenerlo a cero.

**El email va hasheado (sha256) en la clave.** Esta tabla no puede convertirse en un censo
de direcciones registradas: quien la lea vería en claro todas las que han intentado entrar,
incluidas las que no tienen cuenta. Se normaliza antes de hashear (minúsculas, sin espacios)
porque `users.email` es `citext`: si no, el límite se salta escribiendo `A@B.com`.

La IP **no** se hashea: no identifica a una persona por sí sola y verla en claro es lo que
permite diagnosticar un ataque mirando la tabla.

### Detalles que se han decidido

- **Falla cerrado.** Si la base no responde, se deniega. No es una decisión dura: el login
  necesita la base para verificar la contraseña, así que si está caída no hay login que
  permitir.
### La IP del cliente · una suposición que hay que revisar si se cambia de hosting

**Una cabecera la escribe quien envía la petición.** Si nadie la sanea, cualquiera manda su
propia `X-Forwarded-For: 1.2.3.4` y se salta el límite por IP entero, cambiando el valor en
cada intento.

Quedarse con la **primera** entrada de `X-Forwarded-For` es, en el caso general, la opción
**falsificable**: en una cadena real de proxies el cliente puede anteponer lo que quiera y
los proxies solo van añadiendo detrás.

Aquí es aceptable **únicamente porque Vercel reescribe la cabecera** y no reenvía valores
externos, justamente para impedir el spoofing: cuando la petición llega a la función,
`X-Forwarded-For` trae un solo valor y lo puso la plataforma. Primera y última son la misma.

Orden de preferencia que implementa `src/lib/rate-limit/claves.ts`:

| Orden | Cabecera | Por qué |
|---|---|---|
| 1 | `x-vercel-forwarded-for` | La pone Vercel y **no se sobrescribe** aunque el usuario coloque otro proxy por delante. La más fiable. |
| 2 | `x-real-ip` | También la pone la plataforma. |
| 3 | `x-forwarded-for` (primera entrada) | **Solo respaldo de desarrollo local.** Falsificable fuera de Vercel. |

> **AVISO PARA EL FUTURO.** Esa suposición es **de Vercel, no nuestra**. Si esto se despliega
> en otro sitio —un contenedor detrás de nginx, un balanceador propio, Cloudflare delante—
> **deja de valer y hay que revisar `ipDelCliente`**. En esos entornos la IP de fiar es la que
> añade el proxy de confianza más cercano (habitualmente la **última** entrada, o la penúltima
> según cuántos saltos controles), nunca la primera. Cambiar de hosting sin revisar esto deja
> el límite por IP desactivado de facto, y en silencio.

- **Sin cabecera de IP, la clave por IP no se aplica** (se devuelve `null`). No se inventa un
  cubo «desconocido» compartido: todos los clientes sin cabecera se bloquearían entre sí.
- `RATE_LIMIT_ENABLED` existe **solo** para los tests de integración y viene **activado por
  defecto**. Un límite que hay que acordarse de encender no es un límite.

## 6. Cabeceras y transporte

En `next.config.ts` (o middleware), para todas las rutas:

- `Content-Security-Policy`: `default-src 'self'` con `img-src 'self' data:`,
  `connect-src 'self' https://graphql.anilist.co https://api.anthropic.com`,
  `font-src 'self' https://fonts.gstatic.com`, `style-src 'self' 'unsafe-inline'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`.
  Los `script-src` usan **nonce** por petición; `unsafe-eval` está prohibido.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `X-Frame-Options: DENY`

Todo enlace externo que abre pestaña: `target="_blank" rel="noopener noreferrer"`.

## 7. Secretos

- Nunca en el repo. `.env` está en `.gitignore`; `.env.example` documenta cada variable
  **sin valores**.
- Nada de `NEXT_PUBLIC_` para nada que sea secreto: esa variable acaba en el bundle del
  navegador. `ANTHROPIC_API_KEY`, `DATABASE_URL` y `AUTH_SECRET` son **server-only**.
- Los módulos que tocan secretos empiezan por `import "server-only"`.
- Rotación: si un secreto aparece en un log, en un commit o en una captura, se rota. No se
  «vigila».

### La cadena de producción no vive en tu disco

**Ésta es la protección real contra destrozar la base de producción, y no es la lista de
permisos.** Una regla de `settings.json` solo controla lo que se puede *teclear*; no
controla contra qué base apunta lo que se teclea. Si `DATABASE_URL` de producción está en
tu `.env.local`, cualquier comando cotidiano —`db:push`, `db:migrate`, un script, un test
de integración, un `drizzle-studio` abierto en la pestaña equivocada— apunta a producción
sin avisar. Denegar `db:push` no arregla eso: solo desplaza el accidente al siguiente
comando de la lista.

Por eso:

| Entorno | Dónde vive `DATABASE_URL` | Apunta a |
|---|---|---|
| Local | `.env.local` (en `.gitignore`) | un **branch de desarrollo de Neon**, desechable |
| Test / CI | secreto del workflow | un **branch de test de Neon**, se recrea en cada ejecución |
| Preview | variables de Vercel, entorno *Preview* | branch de preview |
| **Producción** | **solo** variables de Vercel, entorno *Production* | la base real |

**La cadena de producción no se copia jamás a un fichero del disco.** Ni a `.env.local`, ni
a `.env.production`, ni pegada «un momento para probar algo». Si hace falta operar contra
producción, se hace desde el panel de Neon o pasando la variable en línea y solo para ese
comando, nunca exportándola a la sesión.

Neon regala el mecanismo que hace esto cómodo: los **branches** son copias instantáneas de
producción. Probar una migración de riesgo se hace contra un branch, no contra la base real.

Corolario para `db:push`: está en `ask`, no en `deny`, porque **es la forma normal de iterar
el esquema en local** durante el desarrollo (FASE 1). Lo que lo hace seguro no es que
alguien lo bloquee, es que la única cadena que tienes a mano apunta a una base desechable.

## 8. Validación

- **Todo** input externo pasa por un esquema Zod antes de tocar la lógica: body, query,
  `searchParams`, formData, respuesta de AniList y respuesta de Claude incluidas.
- Los esquemas viven en `src/lib/validation/` y se comparten entre cliente
  (react-hook-form + `zodResolver`) y servidor. El cliente valida por UX; **el servidor
  valida por seguridad** y nunca confía en la validación del cliente.
- Los ficheros subidos (`.xlsx`, `.csv`, imágenes) se validan por magic bytes y tamaño,
  no por extensión.
- Las URLs de `continue_link` se validan (`http`/`https` únicamente) antes de renderizarse
  como `href`; `javascript:` es XSS.

## 9. Inyección

- **SQL:** solo Drizzle con parámetros. `sql.raw()` está **prohibido** con datos del usuario.
  Para `pg_trgm` y `unaccent` se usa el helper tipado `sql` con placeholders.
- **XSS:** nunca `dangerouslySetInnerHTML` con contenido de AniList, de Claude o del usuario.
  Las descripciones de AniList llegan con HTML: se sanitizan a texto plano en el servidor.
- **Prompt injection:** la sinopsis que se manda a Claude viene de fuera. El prompt del
  sistema declara explícitamente que el contenido del usuario es **datos, no instrucciones**,
  y la respuesta se valida contra un Zod estricto con vocabulario cerrado. Si no valida, se
  descarta: nunca se guarda «lo que haya devuelto».
