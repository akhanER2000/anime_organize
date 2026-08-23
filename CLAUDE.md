# ANIME VAULT — instrucciones del proyecto

Aplicación web **personal y multiusuario** para catalogar anime. Cada usuario tiene su
_vault_: sus series, sus portadas, su progreso y sus enlaces para continuar viendo.
Estética «obsidiana y oro»: una losa de laja negra partida y reparada con kintsugi.

Destino: **Vercel**. Base de datos: **Neon**.

---

## Las dos reglas que no se rompen

1. **Nunca uses Supabase.** Ni su cliente, ni su auth, ni sus políticas RLS.
   La base es **Neon + Drizzle**. Si una skill o un ejemplo asume Supabase, se adapta o se
   descarta.
2. **Nunca hardcodees un color: usa los tokens.** Ni un solo hex fuera del bloque `@theme`
   de `src/app/globals.css`. La fuente de verdad es `design/tokens.css` / `design/tokens.json`.

Y una tercera, de datos: **no se inventan datos de los animes del usuario.**
Todo sale de `animes-seed.json` o de AniList.

---

## Stack

| Área          | Elección                                               | Nota                                                         |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Framework     | **Next.js 15**, App Router, React Server Components    |                                                              |
| Lenguaje      | **TypeScript estricto**                                | `any` prohibido, `!` prohibido                               |
| Estilos       | **Tailwind CSS v4** con tokens en `@theme`             | sin CSS-in-JS                                                |
| Base de datos | **Neon** (Postgres serverless)                         | **nunca Supabase**                                           |
| ORM           | **Drizzle ORM** + drizzle-kit                          | driver `@neondatabase/serverless`                            |
| Auth          | **Auth.js v5** (next-auth beta)                        | Credentials + Google opcional, sesión JWT                    |
| Validación    | **Zod** en todo input · **react-hook-form** en cliente | mismo esquema en ambos lados                                 |
| Imágenes      | **sharp**                                              | re-encode a WebP 82                                          |
| Excel/CSV     | **SheetJS** (`xlsx`)                                   | importación y exportación                                    |
| IA            | **@anthropic-ai/sdk** + **AniList GraphQL** público    | `ANTHROPIC_MODEL` = `claude-sonnet-5`                        |
| Tests         | **Vitest** (unidad) + **Playwright** (e2e)             |                                                              |
| Gestor        | **npm**                                                | corepack no puede escribir en el dir de Node en esta máquina |

---

## Comandos

```bash
npm run dev              # desarrollo en http://localhost:3000
npm run build            # build de producción
npm run start            # sirve el build (lo que usa el e2e)

npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run lint:tokens      # falla si hay un hex fuera de globals.css
npm run format           # prettier --write

npm run test             # vitest run
npm run test:watch       # vitest
npm run test:cov         # con cobertura (umbrales en .claude/rules/testing.md)
npm run test:e2e         # playwright (contra build + start, no dev)

npm run db:generate      # genera la migración desde el esquema TS
npm run db:migrate       # aplica migraciones  (usa DATABASE_URL_UNPOOLED)
npm run db:push          # SOLO desarrollo local. Jamás contra producción.
npm run db:studio        # drizzle-studio

npm run seed             # carga animes-seed.json + portadas desde Drive (idempotente)
npm run enrich           # enriquecimiento masivo AniList + Claude
```

**Verificación antes de decir «terminado»** (y hay que **leer** la salida):

```bash
npm run typecheck && npm run lint && npm run lint:tokens && npm run test && npm run build
```

---

## Arquitectura de carpetas

```
anime-vault/
├── design/                 EL DISEÑO APROBADO — fuente de verdad visual (no se toca)
│   ├── tokens.css · tokens.json      mandan sobre color, tipografía, espaciado
│   ├── DESIGN-SPEC.md                manda sobre medidas, estados y breakpoints
│   ├── screens/*.png                 los 12 artboards, para comparar
│   ├── assets/  assets/web/          texturas de laja y piezas kintsugi
│   └── scripts/                      prototipo desechable: NO va a producción
├── animes-seed.json        los 83 animes reales del propietario
├── drizzle/                migraciones generadas y revisadas a mano
├── scripts/
│   ├── seed.ts             carga del seed + portadas desde Drive
│   └── enrich.ts           enriquecimiento masivo por CLI
├── e2e/                    Playwright: el flujo crítico
├── public/texturas/        las texturas ya optimizadas que sirve la app
└── src/
    ├── app/
    │   ├── (publico)/      landing, login, registro, recuperar
    │   ├── app/            el vault — protegido por middleware
    │   └── api/            route handlers
    ├── components/
    │   ├── ui/             primitivas del sistema (Boton, Input, Chip, Badge, Veta…)
    │   ├── anime/          dominio (AnimeCard, FichaAnime, ModalAnadir…)
    │   └── layout/         BarraSuperior, NavMovil, Marco…
    ├── lib/
    │   ├── db/             cliente, esquema, repositorios, ownership
    │   ├── domain/         reglas PURAS: normalizar, duplicados, progreso, enums
    │   ├── validation/     esquemas Zod compartidos cliente/servidor
    │   ├── covers/         pipeline de portadas (fetch seguro, sharp, drive)
    │   ├── enrich/         AniList + Claude
    │   ├── import-export/  xlsx · csv · json
    │   └── api/            sobre de respuesta, errores, middlewares
    └── hooks/
```

**Regla de dependencias:** `src/lib/domain/` no importa nada de `db/`, de `app/` ni de React.
Es lógica pura y testeable sin arrancar nada.

---

## Reglas del proyecto

Léelas antes de tocar el área que cubren. Son **normativas**, no descriptivas.

- @.claude/rules/code-style.md — TypeScript estricto, nombres, imports, estructura
- @.claude/rules/testing.md — qué se testea, cómo y con qué umbral
- @.claude/rules/api-conventions.md — sobre de respuesta, códigos de error, validación Zod
- @.claude/rules/design-tokens.md — **la paleta y la tipografía completas. Prohibido el hex**
- @.claude/rules/db-conventions.md — nombres, uuid, índices, migraciones, Neon
- @.claude/rules/security.md — propiedad por `user_id`, SSRF, rate limits, secretos

Y la skill de dominio, que es la primera parada ante cualquier duda funcional:

- @.claude/skills/anime-vault-domain/SKILL.md — normalización de títulos, deduplicación,
  mapeo de estados y progreso, contrato del pipeline de portadas, vocabulario de etiquetas IA

---

## Comandos del proyecto

| Comando               | Qué hace                                                            |
| --------------------- | ------------------------------------------------------------------- |
| `/project:review`     | revisión completa del cambio actual (corrección, seguridad, diseño) |
| `/project:fix-issue`  | reproducir, corregir y testear un bug                               |
| `/project:deploy`     | checklist previo + despliegue a Vercel                              |
| `/project:seed`       | recargar `animes-seed.json` y sus portadas                          |
| `/project:enrich`     | lanzar el enriquecimiento AniList + Claude                          |
| `/project:db-migrate` | generar y aplicar una migración Drizzle de forma segura             |
| `/project:new-screen` | crear una pantalla nueva respetando el diseño y los tokens          |

## Subagentes

| Subagente             | Cuándo                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `code-reviewer`       | tras implementar; busca bugs y **fugas entre usuarios**                |
| `security-auditor`    | **obligatorio** si tocas `src/lib/covers/`, auth o borrado de cuenta   |
| `db-migrator`         | antes de aplicar una migración destructiva o que toque `anime`/`users` |
| `ui-fidelity-checker` | **obligatorio** antes de cerrar cualquier fase con UI                  |

---

## Cómo se trabaja aquí

1. **Antes de codear una fase:** `spec-driven-development` y `writing-plans`.
2. **En la FASE 1:** `design-postgres-tables` y `domain-modeling`.
3. **Sobre `/api/covers`, auth y borrado de cuenta:** `secure-code-guardian` y
   `security-reviewer` son **obligatorios**.
4. **Antes de declarar terminada una fase:** `verification-before-completion` y, si hubo UI,
   el subagente `ui-fidelity-checker` contra el PNG del artboard.
5. **El usuario quiere ver el resultado de cada fase antes de seguir.** No se encadenan dos
   fases sin su visto bueno.

Si algo no está en `design/` ni en las reglas y no se deduce con seguridad → **pregunta**.
No improvises una interpretación.

---

## El diseño manda

Orden de autoridad visual, sin apelación:

1. `design/tokens.css` y `design/tokens.json`
2. `design/DESIGN-SPEC.md`
3. `design/screens/NN-*.png`
4. `design/ANIME-VAULT.dc.html` — lleva literales en línea; **si contradice a `tokens.css`,
   gana `tokens.css`**

`design/scripts/` (`support.js`, `image-slot.js`) es **prototipo desechable**:
no va a producción, esas interacciones se reimplementan en React.

Las reglas del oro (en `design-tokens.md`) no son sugerencias: ≤10 % de oro por pantalla,
nunca oro sobre oro, **un solo botón de relleno dorado sólido por pantalla como máximo**.

---

## Skills copiadas a `.claude/skills/`

35 skills traídas de `J:\Code\Claude_Skills\skills\` más `anime-vault-domain`, que es propia.
**Cada copia lleva al final una sección `## Adaptaciones para Anime Vault`: léela antes que
el cuerpo de la skill.** El original nunca se edita.

### Propia

| Skill                  | Para qué                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **anime-vault-domain** | **Las reglas de dominio: normalización, deduplicación, estados, progreso, portadas, etiquetas IA. Consúltala antes de reimplementar cualquiera de ellas.** |

### Frontend y Next.js (`05-web-frontend`)

| Skill                           | Para qué                                                    | Adaptación                                          |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `nextjs-developer`              | App Router, Server Actions, route handlers, middleware, SEO | decisiones del repo fijadas                         |
| `react-expert`                  | componentes, hooks, Server Components, UI optimista         | sin librería de estado global                       |
| `typescript-pro`                | tipos avanzados, guards, tipos derivados                    | **tRPC descartado**                                 |
| `frontend-ui-engineering`       | UI accesible y responsive de calidad                        | la apariencia sale de `design/`                     |
| `frontend-design`               | criterio visual al ejecutar                                 | ⚠ **el diseño ya está aprobado: aquí no se diseña** |
| `vercel-react-best-practices`   | patrones de rendimiento de React/Next                       | N+1 y binarios en listados                          |
| `vercel-optimize`               | coste y rendimiento en Vercel                               | solo **post-despliegue**                            |
| `performance-optimization`      | perfilado, N+1, Core Web Vitals                             | medir antes de tocar                                |
| `deploy-to-vercel`              | despliegue                                                  | pasa por `/project:deploy`                          |
| `webapp-testing`                | probar la app en navegador                                  | **era Python → `@playwright/test`**                 |
| `playwright-expert`             | e2e, fixtures, CI                                           | contra `build`, no `dev`                            |
| `integration-nextjs-app-router` | ⚠ **es la integración de PostHog**                          | **no aplica**: no usamos analítica                  |

### Backend y base de datos (`06-backend-databases`)

| Skill                    | Para qué                                  | Adaptación                                     |
| ------------------------ | ----------------------------------------- | ---------------------------------------------- |
| `design-postgres-tables` | tipos, restricciones, índices             | DDL **generado por Drizzle**, sin RLS          |
| `postgres-pro`           | `EXPLAIN`, `pg_trgm`, JSONB, índices      | **Neon**: nada de tuning de servidor           |
| `api-designer`           | modelado de recursos, errores, paginación | contrato ya cerrado; sin GraphQL ni versionado |

_(Se ignoraron a propósito `supabase` y `supabase-postgres-best-practices`.)_

### Ingeniería de software (`07-software-engineering`)

| Skill                            | Para qué                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| `spec-driven-development`        | especificar cada fase antes de codearla                      |
| `writing-plans`                  | plan verificable por fase, con lo que queda fuera            |
| `executing-plans`                | ejecutar con puntos de control por fase                      |
| `domain-modeling`                | extender el modelo — vive en `anime-vault-domain`            |
| `test-driven-development`        | TDD en las reglas de dominio (no en la UI)                   |
| `testing-strategy`               | razonar cobertura — la estrategia está en `rules/testing.md` |
| `code-review`                    | revisión — usa `/project:review` o `code-reviewer`           |
| `systematic-debugging`           | depurar sin adivinar; trampas típicas del repo anotadas      |
| `verification-before-completion` | evidencia antes de afirmar que algo funciona                 |
| `documentation`                  | README, runbooks, CHANGELOG — en español                     |

### DevOps y seguridad (`08-devops-security`)

| Skill                    | Para qué                                                    |
| ------------------------ | ----------------------------------------------------------- |
| `secure-code-guardian`   | auth, validación, OWASP — concretado en `rules/security.md` |
| `security-reviewer`      | formato de informe de auditoría — usa `security-auditor`    |
| `security-and-hardening` | endurecer entradas no confiables                            |
| `ci-cd-and-automation`   | GitHub Actions con las puertas de calidad                   |

### Meta (`00-meta-skills`)

| Skill                | Para qué                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `claude-api`         | SDK, modelos, precios — **`ANTHROPIC_MODEL` = `claude-sonnet-5`** |
| `prompt-engineering` | el prompt del paso 2 del enriquecimiento                          |
| `using-agent-skills` | descubrir qué skill aplica; orden de prioridad del repo           |
| `skill-creator`      | crear/afinar skills **dentro de este repo**                       |

### Documentos (`11-documents-visualization`)

| Skill                      | Para qué                               | Adaptación                              |
| -------------------------- | -------------------------------------- | --------------------------------------- |
| `xlsx`                     | importación y exportación de hojas     | **era Python/openpyxl → SheetJS en TS** |
| `markdown-mermaid-writing` | diagramas del README y de arquitectura | en español, sin adorno                  |

---

## Notas operativas

- **`design/` está excluido del despliegue** (`.vercelignore`): son ~85 MB de PNG originales
  que no se sirven nunca. Lo que la app usa vive optimizado en `public/texturas/`.
- **`CLAUDE.local.md` y `.claude/settings.local.json` están en `.gitignore`**: son notas y
  permisos personales.
- **El gestor es `npm`**, no pnpm ni yarn ni bun. Si una skill copiada usa `pnpm`/`yarn`
  en su cuerpo original, tradúcelo a `npm` al aplicarla: `pnpm <script>` → `npm run <script>`,
  `pnpm add X` → `npm install X`, `pnpm dlx` → `npx`. Y recuerda que **npm necesita `--`**
  para pasar argumentos a un script: `npm run seed -- --dry-run`.
