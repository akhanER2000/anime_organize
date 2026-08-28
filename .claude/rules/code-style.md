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

Orden, con línea en blanco entre bloques. **Esto no lo aplica ningún linter**: es convención,
y la sostiene la revisión. `eslint-plugin-import` no es dependencia del proyecto —llega de
rebote con `eslint-config-next`, y de él solo queda activa `import/no-anonymous-default-export`—
y `eslint.config.mjs` no enciende `import/order`. Se dice aquí porque quien crea que hay una
regla detrás deja de mirar el orden, y no hay nadie más mirándolo:

```ts
import "server-only";                       // 1. directivas de entorno

import { cache } from "react";              // 2. externos
import { z } from "zod";

import { vaultDe } from "@/lib/db";         // 3. internos por alias @/
import { normalizarTitulo } from "@/lib/domain/normalizar";

import { AnimeCard } from "./anime-card";   // 4. relativos del mismo módulo

import type { Vault } from "@/lib/db";      // 5. type-only al final
```

> **Este ejemplo se corrigió el 2026-08-28.** El de antes tenía tres de sus cinco imports
> rotos —`db` nunca se exportó de `@/lib/db`, `@/lib/db/schema` es un **error** de ESLint
> desde `src/`, y `@/lib/domain` no existe—: el ejemplo canónico de estilo no pasaba el lint
> de este repo.
>
> El ejemplo nuevo importa **dos veces de `@/lib/db`** —el valor y el tipo— y eso no
> contradice la viñeta de los barriles: `@/lib/db` no es un barril que reexporte medio
> proyecto, es **la puerta pública del contrato de datos**, y es justamente la que no
> deja salir ni las tablas ni el cliente. La viñeta prohíbe los barriles que ocultan de
> dónde viene cada cosa; ésta existe para ocultar exactamente una: el cliente crudo.

- Alias `@/` → `src/`. **Prohibido** `../../../`. Si necesitas subir dos niveles, usa el alias.
- `import type` para lo que solo se usa como tipo (`verbatimModuleSyntax` lo exige, y
  `@typescript-eslint/consistent-type-imports` lo marca como **error** en `eslint.config.mjs`).
  Ésta sí es una regla aplicada; el orden de arriba no.
- Sin imports de barril (`index.ts` que reexporta medio proyecto): rompen el tree-shaking y
  crean ciclos. Excepción: `src/lib/db/schema/index.ts`, que Drizzle necesita.
- **`@/lib/db` no exporta `db`.** Exporta `vaultDe`, `enTransaccion`, `ContextoUsuario`, los
  dos errores y los tipos del vault (`Vault`, `AnimeEnListado`, `DatosCrearAnime`…). Ni el
  cliente crudo ni las tablas salen de ahí, y no es un olvido: es el mecanismo del contrato
  de datos (`db-conventions.md`).
- **`@/lib/db/schema` está prohibido desde la aplicación**, y no de palabra:
  `no-restricted-imports` lo marca como error —«Las tablas de Drizzle no se importan desde la
  aplicacion. Usa `vaultDe(ctx)` de @/lib/db: **el filtro por usuario viene dado por la forma
  de la API en vez de por acordarse**»—, igual que `@/lib/db/interno`, `@/lib/db/vault`,
  `@/lib/db/ownership` y el driver a pelo (`@neondatabase/serverless`, `drizzle-orm/neon-http`).
  Quedan fuera **cuatro** sitios, no tres: `src/lib/db/**`, `src/auth.ts`,
  `src/lib/rate-limit/**` y —el último bloque de `eslint.config.mjs`— **los ficheros de
  test** (`src/**/*.test.ts` y `.tsx`), donde la regla está en `off`. Un test de
  integración tiene que poder leer la tabla cruda para comprobar SOBRE QUÉ FILA actuó una
  operación, que es justo lo que la regla impide en la aplicación.
- **No hay barril `@/lib/domain`**: se importa el fichero concreto —`@/lib/domain/normalizar`,
  `@/lib/domain/enums`, `@/lib/domain/alta`—, que es lo que pide la viñeta de arriba.
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
    ui/                   primitivas del sistema de diseño (Boton, Campo, Chip, Badge…)
    anime/                dominio anime (AnimeCard, AccionesFicha, ModalAnadir…)
    layout/               BarraSuperior, NavMovil, Pantalla404 — los tres, no hay más
  lib/                    LAS QUINCE. Aquí se grepea antes de escribir una utilidad
    db/                   la puerta a los datos: contexto, esquema y consultas del vault
    domain/               reglas puras: normalizar, deduplicar, progreso, enums
    validation/           esquemas Zod compartidos
    ui/                   cn, clases, texto, fecha, href, refs, eventos, navegación circular
    covers/               pipeline de portadas (descargar, sharp, espejo en Drive)
    enrich/               AniList + Claude
    import-export/        xlsx / csv / json
    api/                  sobre de respuesta, códigos de error, guarda CSRF
    auth/                 login, registro, password, sesión, duración, vinculación
    config/               lectura y validación del entorno
    email/                drivers (consola · Resend), plantillas, reintentos
    rate-limit/           claves, política y cubos del limitador
    red/                  petición saliente segura (anti-SSRF) y comprobación de espejos
    security/             la CSP
    design/               cromo del navegador
  styles/
```

> **No hay `src/hooks/`, y no es un olvido.** El proyecto no exporta ni un solo hook propio:
> `grep -rn "function use[A-Z]" src/` no devuelve nada. El árbol la listaba y mandaba a
> buscar una carpeta que nunca se creó. Cuando haga falta el primer hook se crea entonces,
> con el hook dentro y en el mismo commit. **Y `lib/` va entero a propósito:** el punto 6 de
> `CLAUDE.md` manda grepear en `src/lib/` antes de escribir una utilidad, y nadie busca en
> una carpeta que no sabe que existe — faltaban ocho, `ui/` entre ellas, que es la dueña de
> diez de las veintiocho filas de «Conceptos con un solo dueño». Corregido el 2026-08-28.

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

> **Esta sección describe lo que HAY.** Describía otra cosa —un `src/lib/api/errors.ts`
> con una clase `ErrorDominio`, y un logger en `src/lib/log.ts`— y **ninguno de los dos
> existió nunca**. Una regla que documenta lo que no existe manda a quien la lee a buscar
> un fichero fantasma, y hace que deje de fiarse del resto del documento. Se corrigió el
> 2026-08-28, al pillarla.

### Un fallo esperado NO se lanza: se devuelve

El dueño del contrato es **`src/lib/api/respuesta.ts`**, y no exporta ninguna clase de
error: exporta un **sobre discriminado** y tres funciones para construirlo.

```ts
import { exito, fallo, falloDeValidacion, type Respuesta } from "@/lib/api/respuesta";

if (!validado.success) return falloDeValidacion(validado.error.issues);
if (creado === null) return fallo("ANIME_DUPLICADO", "Ya tienes ese anime en tu vault.");
return exito({ id: creado.id });
```

`CODIGOS` es la lista cerrada de códigos y `CodigoError` se deriva de ella. La tabla con
el significado de cada uno y su equivalente HTTP está en `api-conventions.md`.

**Por qué se devuelve y no se lanza:** una Server Action que lanza le llega al cliente como
un error genérico de React —sin código y sin mensaje en producción—, así que el formulario
no puede pintar nada útil. Devolver el sobre deja el error donde se puede enseñar.

### Las excepciones que SÍ existen, y para qué

Cuatro clases, y ninguna es un «error de negocio»: las cuatro señalan que **el programa
está en un estado en el que no puede continuar**.

| Clase | Dónde | Qué señala |
|---|---|---|
| `ErrorSesionInvalida` | `src/auth.ts` | la sesión no vale: hay que mandar al login |
| `ErrorConfiguracion` | `src/lib/config/entorno.ts` | falta una variable obligatoria: se para al arrancar |
| `ErrorContextoFalsificado` | `src/lib/db/contexto.ts` | alguien intentó forjar un `ContextoUsuario` |
| `ErrorNoEncontrado` | `src/lib/db/contexto.ts` | el recurso no existe **o no es tuyo** |

- `try/catch` solo donde puedes **hacer algo** con el error. Envolver por envolver y
  re-lanzar el mismo error es ruido.
- Nada de `catch {}` vacío. Si de verdad se ignora, se comenta por qué en una línea.

### Trazas: `console` directo, y ésa es la convención

**No hay módulo de logger, y no hace falta.** El código de producción escribe con
`console` directamente: 15 llamadas en `src/`, **ninguna de ellas `console.log`**.

| Nivel | Cuándo | Ejemplo real |
|---|---|---|
| `console.error` | algo falló y alguien tiene que mirarlo | `[email] fallo al enviar` |
| `console.warn` | siguió funcionando, pero hay algo que decir | `[portadas] no se pudo subir al espejo de Drive` |
| `console.info` | un camino alternativo se activó a propósito | el driver de consola del correo |

**`console.log` está prohibido igual que antes.** Lo que cambia es a dónde te manda la
regla: en Vercel, `console.error` y `console.warn` van a los logs de la función con su
nivel, y eso es exactamente lo que hace falta. Un módulo envoltorio encima no añadiría
nada que no tengamos y sería una indirección más que abrir para leer una traza.

**El prefijo es `[modulo]`**, entre corchetes, y en español: `[email]`, `[portadas]`,
`[recuperar]`, `[pantalla]`. Hay cuatro llamadas antiguas con el estilo `modulo:` sin
corchetes (`login:`, `recuperar:`); no se migran a la fuerza, pero lo nuevo lleva
corchetes: son lo que hace que un `grep` sobre los logs de Vercel encuentre un módulo
entero.

**Lo que NUNCA se loguea** (`security.md` §7 y `api-conventions.md`): contraseña,
`password_hash`, token de reset, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, la cadena de la base,
el cuerpo de la respuesta de un proveedor —que puede traer cabeceras y credenciales— ni el
email completo en producción. Del error de un tercero se registra **el código de estado**,
no la respuesta.

**Si algún día hace falta un logger de verdad** —correlación por petición, salida
estructurada, envío a un servicio—, se crea entonces y se migran las 15 llamadas en el
mismo commit. Lo que no se hace es documentarlo antes de que exista.

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
| Contar coincidentes sobre agregados de la base | `src/lib/validation/biblioteca.ts` |
| **Construir la URL de «quitar el filtro»** | `src/lib/validation/biblioteca.ts` (`urlSinFacetas`) |
| Describir el filtro puesto en palabras | `src/lib/ui/texto.ts` |
| El texto del contador «N de M» | `src/lib/ui/texto.ts` |
| **Los dos estados vacíos del vault** | `src/components/anime/vacio.tsx` |
| Parsear y construir `?orden=` y `?dir=` | `src/lib/validation/orden-lista.ts` |
| Validar el alta de un anime | `src/lib/validation/anime.ts` |
| Formatear una fecha para pantalla | `src/lib/ui/fecha.ts` |
| Componer las clases con los tokens | `src/lib/ui/cn.ts` |
| Entregar un nodo a un `ref` que viene de fuera | `src/lib/ui/refs.ts` |
| Decidir si un `href` es seguro | `src/lib/ui/href.ts` |
| Botón, enlace, chip, badge, input, skeleton | `src/components/ui/` |
| Selector, combobox, pestañas, tooltip, zona de arrastre, diálogo de confirmación, progreso editable | `src/components/ui/` |
| Recorrer una lista con las flechas, circular | `src/lib/ui/navegacion-circular.ts` |
| El logotipo | `src/components/ui/marca.tsx` |
| El mensaje de error de un campo | `src/components/ui/mensaje-error.tsx` |
| El anillo de foco, la transición, el titular, la caja de un control, el marco dorado, la etiqueta de sección, la nota secundaria, el hover dorado | `src/lib/ui/clases.ts` |
| La pantalla suelta (404 y error) y el párrafo que explica un estado | `src/lib/ui/clases.ts` |
| El aspecto de un 404 | `src/components/layout/pantalla-404.tsx` |
| La navegación inferior de móvil | `src/components/layout/nav-movil.tsx` |
| Abrir el modal de añadir y enfocar el buscador desde otra rama del árbol | `src/lib/ui/eventos.ts` |
| La card de un anime | `src/components/anime/anime-card.tsx` |
| La barra de filtros y el conmutador de vista | `src/components/anime/barra-filtros.tsx` |

### Los dos que eran COMPORTAMIENTO, no estética

De los 34 encontrados, dos no se podían dejar para el barrido general porque no
divergían en cómo se ven sino en **qué hacen**:

1. **«Quitar el filtro» tenía dos destinos.** El chip «Todos» borraba las dos
   facetas y conservaba el resto de la query; la salida del vacío sin resultados
   era un `href="/app"` a pelo que la tiraba entera. Desde
   `/app/lista?estado=ABANDONADO&orden=titulo`, el chip dejaba el orden puesto y
   el botón lo perdía. Ganó conservar: quitar el filtro es quitar EL FILTRO, no
   reiniciar la pantalla.

2. **El vacío de la lista no tenía salida.** La rejilla ofrecía un botón
   «Quitar los filtros» y nombraba el filtro puesto; la lista decía «Sin
   resultados» y le pedía al usuario que quitara un chip él mismo. Con el
   conmutador de vista encima, la misma situación daba o no daba un botón según
   en qué vista estuvieras. Ganó la rejilla en las tres diferencias, porque en
   las tres dice más.

La regla que sale de los dos: **cuando dos copias divergen en lo que HACEN, no
esperan al barrido.** Un duplicado idéntico es deuda; uno que se comporta
distinto es un bug que el usuario encuentra el primer día.

### El barrido es ahora un comando, no una tanda

`npm run lint:duplicados` cuenta las recetas de clases escritas literalmente en
más de un fichero y **falla si el número sube**. Está encadenado en
`lint:todo`, así que corre en cada commit.

Va con techo y no a cero a propósito: los 12 que quedan son utilidades sueltas
—`font-ui text-ui-s text-[var(--porcelain-200)]` y parecidas— que meter en una
constante solo añadiría una indirección que hay que ir a leer. Lo que importa no
es que haya duplicados: es que **aparezcan sin que nadie lo decida**.

Si uno nuevo está justificado, se sube el techo A MANO en el mismo commit. Ese
diff es la conversación.

Bajó de 26 a 14, y luego a 12 —**cuando el propio script paró un commit** que traía dos recetas nuevas de la pantalla de Ajustes—, al dar dueño a: el mensaje de error (seis copias, **dos
interlineados distintos**, y una séptima en `font-ui` cuando la spec dice mono),
el anillo de foco (seis), la transición (once), el titular de pantalla (tres), la
caja de un control (tres), el marco dorado (tres) y la etiqueta de sección (dos).

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

## Los spreads de props van PRIMERO

> **JSX aplica los atributos en orden y el último gana ENTERO.** No los mezcla.
> Así que lo que el componente garantiza va DETRÁS del spread, y lo que el
> llamador puede elegir, delante.

```tsx
MAL   <input className={cn(CONTROL, …)} {...resto} />
BIEN  <input {...resto} className={cn(CONTROL, …)} />
```

### El fallo, y por qué ninguna otra puerta lo para

El campo «Portada» del modal salió **en producción** con 198 × 26 px y sin
poder escribir en él. `resto` traía un `className` del llamador y sustituía
entera la receta del control.

Sobrevivió a todo lo que hay montado:

| Nivel | Por qué no lo vio |
|---|---|
| `tsc` | pasar `className` a algo que acepta `className` es correcto |
| ESLint | no es una cuestión de estilo |
| La suite de unidad | **no renderiza**: no existe atributo que mirar |
| Quien lee el código | ve un `cn(...)` justo encima y da por hecho que gana |

Lo encontró un navegador. Como el registro sin nombre, como la CSP, como el
404 que respondía 200.

### Y no era un caso: era una clase

Un barrido de 23 componentes con verificadores independientes encontró **ocho
agujeros más de la misma forma**, en cuatro primitivas, y **ninguno tenía
síntoma todavía** —nadie pasaba aún la prop que los dispara—. Eran bugs con
fecha de caducidad futura:

| Dónde | Prop pisada | Qué se perdía |
|---|---|---|
| `campo.tsx` (input y textarea) | `aria-describedby`, `aria-invalid` | el enlace con el error y con la ayuda: **la razón de existir del componente**. El `<p>` seguía pintado sin que nadie lo apuntara |
| `selector.tsx` | `aria-describedby` | la ayuda, muda para un lector de pantalla |
| `chip.tsx` | `type` | el `type="button"`: un chip de filtro dentro de un `<form>` volvía a ser el botón de envío |
| `enlace.tsx` | `rel`, `target` | **`rel="noopener noreferrer"`** (security.md §6), sobre URLs que pega el usuario |

El de `enlace.tsx` es el que más enseña: el comentario de esa misma línea
decía «No es configurable A PROPÓSITO», y era configurable. **Un comentario
que afirma una garantía no la implementa.**

### El `ref` es el caso aparte, y se COMPONE

Desde React 19 el `ref` de un componente de función viaja como una prop
normal, así que entra en `...resto` con todo lo demás. Dos agravantes:

1. El compilador rechaza `<Casilla ref={…} />` escrito a mano, pero **no**
   `<Casilla {...register("recordarme")} />` —un spread no pasa la comprobación
   de propiedades excedentes—. La forma peligrosa es justo la que compila.
2. **Los dos refs son legítimos**: la primitiva necesita el nodo (`indeterminate`
   no es un atributo de HTML, sólo se puede escribir en la propiedad) y
   react-hook-form también (sin él, el control deja de registrarse). Aquí no
   gana ninguno: se componen, con `fijarRef` de `src/lib/ui/refs.ts`.

### Cómo se comprueba

- **`npm run lint:spread`** (encadenado en `lint:todo`) parsea los `.tsx` con
  el compilador de TypeScript y falla si un spread va detrás de un atributo.
  Aquí **no hay techo**: son 0 y se quedan en 0. Cuando el llamador deba pisar
  a propósito, se escribe el motivo y se sigue:
  `{...resto} // lint-spread-ok: <por qué>`.
- **`src/components/ui/spread-de-props.test.tsx`** renderiza y **mira el
  atributo que sale**, que es lo único que ve esta clase de fallo. Los
  `.test.tsx` quedan fuera del lint: atacar al componente con un spread hostil
  es lo que hacen a propósito.

Las dos hacen falta. El lint cubre las props que nadie ha escrito todavía; el
test cubre que la garantía siga siendo cierta cuando alguien las escriba.
