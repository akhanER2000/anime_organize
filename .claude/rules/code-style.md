# Regla · Estilo de código

## TypeScript estricto de verdad

`tsconfig.json` no negocia:

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "forceConsistentCasingInFileNames": true
}
```

- **`any` está prohibido.** Si no sabes el tipo, es `unknown` y lo estrechas. El lint falla
  con `@typescript-eslint/no-explicit-any`.
- **`as` casi prohibido.** `as const` sí. `as unknown as X` **nunca**: si necesitas eso, el
  modelo está mal. Para datos externos, un *type guard* o un parseo Zod.
- **`!` (non-null assertion) prohibido.** Estrecha con `if`, con `??` o con un guard que lance
  un error con mensaje. Un `!` es una excepción en producción esperando su turno.
- Los datos que cruzan una frontera (HTTP, BD, fichero, IA) se **parsean**, no se castean.
  `EsquemaX.parse(json)` devuelve un tipo real; `json as X` es una mentira tipada.
- Tipos derivados de una única fuente: los de la BD salen de Drizzle
  (`typeof anime.$inferSelect`), los de la API salen de los esquemas Zod
  (`z.infer<typeof EsquemaX>`). No se reescriben a mano en dos sitios.

## Nombres

| Cosa | Convención | Ejemplo |
|---|---|---|
| Archivo de componente | `kebab-case.tsx` | `anime-card.tsx` |
| Componente React | `PascalCase` | `AnimeCard` |
| Hook | `useCamelCase` | `useDebouncedSearch` |
| Función / variable | `camelCase` | `normalizarTitulo` |
| Constante de módulo | `SCREAMING_SNAKE_CASE` | `VOCABULARIO_ETIQUETAS` |
| Tipo / interfaz | `PascalCase`, **sin prefijo `I`** | `Anime`, `FiltrosBiblioteca` |
| Esquema Zod | `EsquemaPascalCase` | `EsquemaCrearAnime` |
| Server Action | verbo en infinitivo | `crearAnime`, `marcarProgreso` |
| Booleano | `es…` / `tiene…` / `hay…` | `esFavorito`, `tienePortada` |
| Test | `<archivo>.test.ts` junto al código | `normalizar.test.ts` |
| E2E | `<flujo>.spec.ts` en `e2e/` | `vault-critico.spec.ts` |

**Idioma:** el dominio va en **español** (`anime`, `portada`, `progreso`, `titulo`,
`normalizarTitulo`) porque el usuario y el diseño están en español. Lo técnico y lo que fija
el framework va en inglés (`page.tsx`, `layout.tsx`, `useState`, `userId`, `createdAt`).
No se mezclan dentro de un mismo identificador: `crearAnime`, no `createAnime`, y desde luego
no `crearAnimeHandler_v2`.

## Imports

Orden, con línea en blanco entre bloques (lo aplica `eslint-plugin-import`):

```ts
import "server-only";                       // 1. directivas de entorno

import { cache } from "react";              // 2. externos
import { z } from "zod";

import { db } from "@/lib/db";              // 3. internos por alias @/
import { anime } from "@/lib/db/schema";

import { AnimeCard } from "./anime-card";   // 4. relativos del mismo módulo

import type { Anime } from "@/lib/domain";  // 5. type-only al final
```

- Alias `@/` → `src/`. **Prohibido** `../../../`. Si necesitas subir dos niveles, usa el alias.
- `import type` para lo que solo se usa como tipo (`verbatimModuleSyntax` lo exige).
- Sin imports de barril (`index.ts` que reexporta medio proyecto): rompen el tree-shaking y
  crean ciclos. Excepción: `src/lib/db/schema/index.ts`, que Drizzle necesita.
- Todo módulo que toque secretos o BD empieza con `import "server-only"`.
  Todo módulo de cliente empieza con `"use client"` **solo si de verdad lo necesita**.

## Server / Client Components

- **Server Component por defecto.** `"use client"` es una excepción que se justifica:
  estado local, efecto, evento del navegador o API del DOM.
- El `"use client"` va lo más abajo posible del árbol. Un layout no se vuelve cliente porque
  un botón necesite `onClick`: se extrae el botón.
- Los datos se cargan en el servidor y se pasan como props ya serializados. Nada de
  `useEffect` + `fetch` para pintar la primera vista.
- Nada de pasar funciones, instancias de clase o `Date` sin serializar a través de la
  frontera servidor→cliente.

## Estructura de carpetas

```
src/
  app/                    rutas (App Router)
    (publico)/            landing, login, registro, recuperar
    app/                  el vault, protegido por middleware
    api/                  route handlers
  components/
    ui/                   primitivas del sistema de diseño (Boton, Input, Chip, Badge…)
    anime/                dominio anime (AnimeCard, FichaAnime, ModalAnadir…)
    layout/               BarraSuperior, NavMovil, Marco…
  lib/
    db/                   cliente, esquema, repositorios, ownership
    domain/               reglas puras: normalizar, deduplicar, progreso, enums
    validation/           esquemas Zod compartidos
    covers/               pipeline de portadas (fetch, sharp, drive)
    enrich/               AniList + Claude
    import-export/        xlsx / csv / json
    api/                  sobre de respuesta, errores, middlewares
  hooks/
  styles/
```

Regla de dependencias: `domain/` **no importa nada** de `db/`, de `app/` ni de React.
Es lógica pura y testeable sin arrancar nada. Si `normalizarTitulo` necesitara la BD,
el diseño estaría mal.

## Componentes

- Un componente por archivo. El archivo se llama como el componente.
- Props tipadas con un `type` local; nada de `React.FC`.
- Sin props booleanas que se acumulen (`isSmall isLarge isHuge`): una prop `tamano`
  con unión literal.
- La composición gana a la configuración: antes de añadir la quinta prop, se parte
  el componente o se acepta `children`.
- **Nada de CSS-in-JS ni de `styled-components`.** Tailwind v4 con los tokens, y `clsx`
  o `cva` para las variantes. Ver `design-tokens.md`.

## Errores

- Errores de dominio tipados en `src/lib/api/errors.ts` (`ErrorDominio` con `codigo`).
  Nunca `throw new Error("algo falló")` en una ruta de negocio.
- `try/catch` solo donde puedes **hacer algo** con el error. Envolver por envolver y
  re-lanzar el mismo error es ruido.
- Nada de `catch {}` vacío. Si de verdad se ignora, se comenta por qué en una línea.
- `console.log` fuera del código de producción. Para trazas, el logger de `src/lib/log.ts`.

## Formato

- Prettier con la config del repo. No se discute el formato: se ejecuta `npm run format`.
- ESLint con `next/core-web-vitals` + `@typescript-eslint` estricto.
  Un `eslint-disable` lleva **siempre** el motivo en la misma línea.
- Sin código muerto, sin imports sin usar, sin ficheros `*.old.ts`. Para eso está git.

## Comentarios

- Se comenta el **porqué**, no el qué. `// incrementa i` sobra; `// AniList corta a 90
  req/min: si subimos la concurrencia devuelve 429 durante 60 s` es oro.
- TSDoc en lo que se exporta y no es evidente, sobre todo en `domain/`.
- Todo comentario en **español**, como el resto del dominio.
- `TODO` con dueño y motivo o no se escribe: `// TODO(portadas): Drive devuelve 302 a un
  interstitial cuando el fichero supera 25 MB — falta manejar ese caso.`


## Conceptos con un solo dueño

> **Un concepto, un fichero.** Si algo se puede escribir dos veces, se escribirá dos
> veces, y las dos copias divergirán. No es pesimismo: está medido.

### Por qué existe esta sección

Cuatro pantallas las escribieron cuatro agentes en paralelo, cada uno confinado a su
carpeta. Un barrido posterior encontró **34 conceptos implementados dos o más veces**,
**16 de ellos ya divergiendo**. Ninguna copia estaba mal por separado; lo que estaba mal
era que hubiera dos.

El caso que lo destapó: la biblioteca y la lista traían cada una su parseador de
`?estado=` y `?favorito=`. Una devolvía los estados en orden canónico y la otra en el
orden de la URL —el mismo filtro descrito con dos textos distintos—, y con
`?favorito=0&favorito=1` una filtraba y la otra no. Con la misma barra de chips encima
prometiendo lo mismo.

### El registro

Cada concepto de esta tabla tiene **un dueño**. Si necesitas su comportamiento, lo
importas de ahí. Si necesitas que cambie, cambias ese fichero.

| Concepto | Dueño |
|---|---|
| Normalizar un título | `src/lib/domain/normalizar.ts` |
| Decidir si un alta es duplicada | `src/lib/domain/duplicados.ts` |
| Los cinco estados, sus etiquetas y su orden | `src/lib/domain/enums.ts` |
| Mapear el progreso del seed | `src/lib/domain/progreso.ts` |
| Parsear `?estado=` y `?favorito=` | `src/lib/validation/biblioteca.ts` |
| Filtrar y contar filas por estado | `src/lib/validation/biblioteca.ts` |
| Parsear y construir `?orden=` y `?dir=` | `src/lib/validation/orden-lista.ts` |
| Validar el alta de un anime | `src/lib/validation/anime.ts` |
| Formatear una fecha para pantalla | `src/lib/ui/fecha.ts` |
| Componer las clases con los tokens | `src/lib/ui/cn.ts` |
| Decidir si un `href` es seguro | `src/lib/ui/href.ts` |
| Botón, enlace, chip, badge, input, skeleton | `src/components/ui/` |
| La card de un anime | `src/components/anime/anime-card.tsx` |
| La barra de filtros y el conmutador de vista | `src/components/anime/barra-filtros.tsx` |

### Qué hacer cuando encuentres un duplicado

1. **Compara las dos copias línea a línea** antes de borrar ninguna. Lo importante no es
   que estén dos veces: es **si se comportan igual**. Un duplicado idéntico es deuda; uno
   que diverge es un bug que todavía no ha dado la cara.
2. Si divergen, **decide cuál gana y escribe por qué** en el fichero que sobrevive. La
   otra pantalla va a cambiar de aspecto o de comportamiento, y quien lo vea merece saber
   que fue una decisión.
3. Añade el concepto a la tabla de arriba.

### Y para los agentes de pantalla

Lo dice `CLAUDE.md` § «Cómo se trabaja aquí» punto 6, y se repite aquí porque es donde se
mira al escribir código: **antes de escribir una utilidad, `grep` en `src/lib/`**. Si no
existe pero huele a compartida, se entrega como propuesta aparte en vez de enterrarla en
la carpeta de una pantalla.
