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
