---
description: Revisión completa del cambio actual — corrección, seguridad, fidelidad al diseño y tokens
argument-hint: "[rama|commit base] (por defecto: main)"
allowed-tools: Bash(git *), Bash(npm *), Bash(npx *), Read, Grep, Glob, Task
---

# /project:review — revisión completa del cambio actual

Base de comparación: `$1` (si está vacío, usa `main`; si no existe `main`, usa el primer
commit del repo).

## 1. Reunir el cambio

```
!git --no-pager diff --stat $1...HEAD
!git --no-pager diff $1...HEAD
!git status --short
```

Si el diff está vacío, revisa el árbol de trabajo (`git diff HEAD`) y dilo.

## 2. Verificación mecánica primero

No opines sobre el código hasta que esto haya corrido y hayas **leído la salida**:

```
!npm run typecheck
!npm run lint
!npm run lint:tokens
!npm run test
```

Un fallo aquí es el primer hallazgo del informe, con la salida real pegada.

## 3. Revisión por ejes

Lee `@.claude/rules/code-style.md`, `@.claude/rules/security.md`,
`@.claude/rules/api-conventions.md`, `@.claude/rules/db-conventions.md` y
`@.claude/rules/design-tokens.md` antes de juzgar nada.

**Eje 1 · Fuga entre usuarios (bloqueante).** Por cada query o mutación tocada:
¿lleva el filtro por `user_id`? ¿Se llega a las tablas hijas por un JOIN contra `anime`
filtrado? ¿El `userId` sale de `auth()` y no del cliente? ¿Un recurso ajeno da 404 y no 403?

**Eje 2 · Corrección.** Casos límite, `null`/`undefined`, errores tragados, `await` que
falta, condiciones de carrera, transacciones que deberían envolver varias tablas,
N+1 en los listados.

**Eje 3 · Seguridad.** Si el diff toca `src/lib/covers/`, auth, borrado de cuenta o
cualquier `fetch` con URL del usuario → **lanza el subagente `security-auditor`** y espera
su informe antes de concluir.

**Eje 4 · Contrato de API.** Sobre `{ ok, data | error }`, código de error correcto,
validación Zod en el servidor, rate limit donde toca.

**Eje 5 · Diseño y tokens.** ¿Algún hex suelto? ¿Alguna clase Tailwind con color literal?
¿Se respetan las reglas del oro? Si el diff toca una pantalla completa → **lanza
`ui-fidelity-checker`** contra el PNG correspondiente de `design/screens/`.

**Eje 6 · Tests.** ¿Lo nuevo está cubierto según `@.claude/rules/testing.md`?
¿Hay `test.skip` nuevos? ¿Se ha bajado algún umbral de cobertura?

## 4. Informe

Ordena por severidad y sé concreto. Para cada hallazgo:

```
[BLOQUEANTE|IMPORTANTE|MENOR] ruta/archivo.ts:línea
Qué está mal (una frase).
Cómo se rompe: entrada concreta → resultado incorrecto.
Arreglo propuesto (código, si es corto).
```

Si no hay hallazgos de un eje, dilo en una línea; no rellenes.
Termina con un veredicto: **listo para merge** / **arreglar antes de merge**.
