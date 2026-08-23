---
description: Checklist previo y despliegue a Vercel
argument-hint: "[preview|production] (por defecto: preview)"
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Bash(npx vercel *), Read, Grep
---

# /project:deploy — checklist previo + despliegue a Vercel

Destino: `$1` (por defecto `preview`).

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

- Árbol limpio. Nada sin commitear.
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
| `DATABASE_URL_UNPOOLED` | sí | para migraciones |
| `AUTH_SECRET` | sí | distinto en producción que en preview |
| `AUTH_URL` / `NEXTAUTH_URL` | sí | la URL real del despliegue |
| `ANTHROPIC_API_KEY` | no | sin ella, el paso 2 del enriquecimiento se salta con aviso |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | login con Google opcional |
| `GOOGLE_DRIVE_*` | no | espejo opcional de portadas |
| `EMAIL_*` | sí en producción | verificación y reset de contraseña |

Si falta alguna obligatoria, para y dilo. Nunca inventes un valor.

## 4. Migraciones — antes del despliegue, no después

```
!npm run db:migrate
```

Contra la base del entorno destino, usando `DATABASE_URL_UNPOOLED`.
**Nunca `db:push` contra producción.** Si la migración es destructiva, ver
`@.claude/rules/db-conventions.md` §Migraciones: se hace en dos pasos y se anuncia.

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
