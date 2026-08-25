---
description: Checklist previo y despliegue a Vercel
argument-hint: "[preview|production] (por defecto: preview)"
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Bash(npx vercel *), Read, Grep
---

# /project:deploy — checklist previo + despliegue a Vercel

Destino: `$1` (por defecto `preview`).

## 0. LO QUE ESTÁ EN `origin` ES LO QUE SE DESPLIEGA · **PUERTA, VA PRIMERO**

> **Vercel no despliega tu disco. Despliega `origin/main`.** Todas las puertas de
> calidad de este documento miden el árbol de trabajo, y ninguna sabe si ese árbol
> llegó a subirse.

```
!git fetch --quiet origin
!git status --short
!git rev-list --left-right --count origin/main...HEAD
```

Las tres condiciones, y **si falla una se para**:

1. **`git status --short` no imprime nada.** Un solo `M` o `??` es trabajo que no
   va a desplegarse.
2. **El contador da `0 0`.** El primer número son commits que tiene `origin` y tú
   no; el segundo, commits tuyos sin subir. Cualquiera distinto de cero significa
   que lo desplegado y lo que tienes delante no son lo mismo.
3. **El SHA que sirve Vercel es el de `origin/main`.** Después de desplegar:

```
!git --no-pager log --format=%H -1 origin/main
```

y se compara con `githubCommitSha` del despliegue en Vercel (panel del proyecto →
Deployments, o `vercel inspect`). **Si no coinciden, el despliegue no es el que
crees**, por muy verde que esté todo lo demás.

### Por qué esto es la puerta 0 y no un apartado más

Porque ya pasó, y es la cuarta vez que aparece **la misma familia de fallo**: todo
en verde, apuntando al sitio equivocado.

| Qué | Todo decía «bien» porque… | Y estaba mal porque… |
|---|---|---|
| `sessions_valid_from` | 17 tests verdes y mutación aprobada | la función no estaba **conectada** al sistema |
| El limitador de intentos | 8 tests contra Postgres real | no estaba en **la puerta que se ataca** |
| `db:verificar` | «Esquema verificado: todo correcto» | leía `DATABASE_URL_UNPOOLED` de `.env.local` y verificaba **la rama de desarrollo** |
| Este | 895 tests, 74 de integración, 48 e2e, build a 0 | **nada se había commiteado**: Vercel servía un commit anterior a las cuatro pantallas |

El patrón es siempre el mismo: **la medición es correcta y el objeto medido no es
el que importa.** Un checklist que solo comprueba calidad responde «¿está bien
esto?» y nunca «¿es esto lo que se va a servir?».

En el caso de este proyecto el fallo se agravó porque el despliegue se hizo a mano
siguiendo `DESPLIEGUE.md` en vez de este comando, y ese documento no llevaba la
puerta. Ahora la lleva, y por eso está aquí arriba: **antes que las puertas de
calidad, no después.** Correr 48 e2e sobre un árbol que no se va a subir es tiempo
gastado en la pregunta equivocada.

## 1. Puertas de calidad — todas verdes, sin excepción

```
!npm run typecheck
!npm run lint
!npm run lint:tokens
!npm run test
!npm run build
```

**Lee la salida de cada una.** Si alguna falla, el despliegue se detiene aquí y se
reporta el fallo. No se despliega «a ver si en Vercel va».

Para `production`, además:

```
!npm run test:e2e
```

## 2. Estado del repo

```
!git status --short
!git --no-pager log --oneline -5
```

- El árbol limpio y el estar sincronizado con `origin` ya se comprobaron en la
  **puerta 0**. Si te la saltaste, vuelve: es la única que responde «¿es esto lo
  que se va a servir?».
- Si estás en `main` y el destino es `preview`, crea rama antes.
- **Comprueba que no se cuela un secreto:**

```
!git --no-pager grep -nE "sk-ant-|postgres://[^\"']*:[^\"']*@|AUTH_SECRET=." -- . ':!*.example' ':!.claude/*' ':!design/*'
```

Cualquier resultado aquí es un **bloqueo total**: se rota el secreto antes de seguir.

## 3. Variables de entorno

Compara `.env.example` con lo que hay configurado en el proyecto de Vercel para el
entorno destino. Deben existir, como mínimo:

| Variable | Obligatoria | Nota |
|---|---|---|
| `DATABASE_URL` | sí | cadena *pooled* de Neon |
| `DATABASE_URL_UNPOOLED` | **no** | **nada en runtime la usa.** Solo migraciones y scripts, que corren desde una máquina, no desde Vercel |
| `AUTH_SECRET` | sí | distinto en producción que en preview |
| `AUTH_URL` / `NEXTAUTH_URL` | sí | la URL real del despliegue |
| `ANTHROPIC_API_KEY` | no | sin ella, el paso 2 del enriquecimiento se salta con aviso |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | login con Google opcional |
| `GOOGLE_DRIVE_*` | no | espejo opcional de portadas |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | sin ellas el enlace se imprime en el log. Obligatorias el día que se abra el registro a terceros |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | sí | `false` mientras el vault sea de una persona |

Si falta alguna obligatoria, para y dilo. Nunca inventes un valor.

## 4. Migraciones — antes del despliegue, no después

### 4a. Extensiones · SE COMPRUEBA EN CADA RAMA DE NEON

**Las extensiones de Postgres son por rama, no por proyecto.** Una rama nueva
(`development`, `preview/*`, `production`) **nace sin ellas**, y la migración `0001` falla
en la primera columna `citext` de `users`. Esto no es hipotético: es el modo de fallo del
primer despliegue a producción.

Contra la base del entorno destino:

```sql
SELECT extname FROM pg_extension WHERE extname IN ('citext','pg_trgm','unaccent');
```

Deben salir **las tres**. Si falta alguna, se aplica `drizzle/0000_extensiones.sql` antes
de nada. (`pgcrypto` **no** se usa: `gen_random_uuid()` es nativo desde Postgres 13.)

**Si el rol `neondb_owner` no puede crear alguna extensión, PARA y avisa al usuario.**
No la rodees: sustituir `citext` por `lower()` a mano desactiva silenciosamente la
deduplicación insensible a mayúsculas, y quitar `pg_trgm` deja el buscador haciendo
*seq scan* sobre toda la tabla.

### 4b. Aplicar

```
!npm run db:migrate
```

Contra la base del entorno destino, usando `DATABASE_URL_UNPOOLED` (la *pooled* no sirve
para DDL largo). **Nunca `db:push` contra producción.** Si la migración es destructiva, ver
`@.claude/rules/db-conventions.md` §Migraciones: se hace en dos pasos y se anuncia.

Comprueba después que se aplicaron las dos:

```sql
SELECT * FROM __drizzle_migrations ORDER BY created_at;
```

## 5. Desplegar

```
!npx vercel deploy            # preview
!npx vercel deploy --prod     # production
```

## 6. Verificación posterior — el despliegue no termina al subir

Sobre la URL devuelta:

- `/` carga y es pública.
- `/app` sin sesión redirige a `/login`.
- Login con la cuenta de prueba y la biblioteca pinta portadas
  **servidas desde `/api/covers/...`**, no desde un dominio externo.
- Cabeceras: `curl -sI <url> | grep -iE "content-security-policy|x-content-type|referrer"`.
- Revisa los logs de runtime del despliegue en busca de errores.

Reporta la URL, el resultado de cada comprobación y cualquier aviso del build.
