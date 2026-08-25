# Vista lista (artboard 04) — supuestos, contradicciones y paradas

Lo que decidí, por qué, y qué NO pude hacer. Escrito para quien integre esta pantalla.

Referencias: `design/screens/04-vista-lista.png`, `design/DESIGN-SPEC.md` §04 · §3 · §6 · §7,
`.claude/rules/design-tokens.md`, `.claude/rules/testing.md`,
`.claude/rules/api-conventions.md` § «Paginación y filtros»,
`.claude/skills/anime-vault-domain/SKILL.md` §3 y §4.

---

## 1. Paradas · cosas que hay que decidir fuera de esta pantalla

### 1.1 ~~El conmutador rejilla/lista no enlaza aquí~~ — **RESUELTO (2026-08-24)**

> `BarraFiltros` lleva ahora `ConmutadorDeVista`: dos enlaces —`/app` y `/app/lista`—
> que **conservan los `searchParams`**, así que el filtro viaja de una vista a otra.
> El activo lleva `aria-current="page"`. Aspecto según DESIGN-SPEC §281.
>
> Tenías razón en el diagnóstico: hasta hoy se llegaba aquí escribiendo la URL.


`BarraFiltros` (`src/components/anime/barra-filtros.tsx`) es compartida y la pinta el
artboard 03. **Hoy no hay ningún camino en la interfaz que lleve a `/app/lista`**: se llega
escribiendo la URL. Como es un componente compartido y el encargo lo prohíbe explícitamente,
no lo he editado.

Lo que hace falta al integrar: un conmutador de dos enlaces —`/app` y `/app/lista`— que
**conserve los `searchParams`**. Si conserva la URL, el filtro y el orden viajan de una vista
a otra sin escribir una línea más, que es justo el motivo de que vivan en la URL.

### 1.2 «Columnas ▾» y «Exportar .xlsx» del artboard: NO implementados

Los dos botones de arriba a la derecha del PNG no están.

- **Exportar .xlsx** necesita un endpoint que no existe. `src/lib/import-export/export.ts`
  está escrito, pero no hay `src/app/api/export/route.ts`, y crear una ruta de API está
  fuera de mi carpeta.
- **Columnas ▾** es un selector de columnas visibles. No está en los entregables, y añadir
  un menú flotante con estado propio para una función que el encargo no pide era inventar
  alcance. La lógica está preparada: `columnas.ts` ya modela cada columna por separado, así
  que añadirlo después es filtrar `COLUMNAS`, no reescribir la tabla.

### 1.3 La columna ACCIONES tiene una sola acción, no las dos del artboard

El PNG enseña dos botones por fila: `▶` (continuar viendo) y `⋯` (menú con «Editar ficha»,
«Marcar como favorito», «Copiar enlace V2», «Quitar del vault»). Ninguno se puede hacer hoy
sin romper una regla:

- **`▶` continuar viendo** necesita el enlace más reciente de cada anime, y eso es
  `vault.enlaceMasReciente(animeId)` **una vez por fila**: 83 consultas donde el encargo
  exige una. `vault.listar()` no devuelve el enlace, y añadírselo es tocar
  `src/lib/db/vault.ts`, que no es de esta pantalla.
- **`⋯` menú de acciones** son mutaciones (editar, favorito, borrar) que pertenecen a los
  artboards 05 y 06 y necesitan sus Server Actions, su confirmación de borrado y su UI
  optimista. Escribirlas aquí habría duplicado lo que otra pantalla va a escribir.

En su lugar la celda lleva **un enlace «Ver ficha»**, obsidiana con borde neutro. Sin oro a
propósito: son 83 celdas iguales y el oro no puede cubrir más del 10 % de la pantalla
(regla del oro nº 1).

**El destino `/app/anime/<id>` todavía no existe** (es el artboard 05): hoy da 404. No lo he
inventado porque `AnimeCard` —que es compartida y ya está escrita— enlaza exactamente ahí, y
dos rutas distintas para la misma ficha sería peor. El recorrido e2e **no** sigue ese enlace.

### 1.4 ~~Los esquemas Zod están en mi carpeta~~ — **RESUELTO (2026-08-24)**

> Movidos a `src/lib/validation/biblioteca.ts` (facetas) y
> `src/lib/validation/orden-lista.ts` (orden). Las dos vistas los comparten.
>
> Y no era solo colocación: **los dos parseadores no hacían lo mismo**. El de la
> rejilla devolvía los estados en el orden canónico de `ESTADOS` y este en el orden de
> la URL, así que el mismo filtro se describía «Visto o Viendo» en una vista y «Viendo
> o Visto» en la otra. Y con `?favorito=0&favorito=1`, una filtraba y la otra no.
> Con la misma barra de chips arriba prometiendo lo mismo.
>
> Al unificar ganó el orden canónico, y `contarPorEstado` devuelve el `Record` completo
> en vez del `Partial`: es el que deja de compilar si se añade un sexto estado.


`api-conventions.md` dice que los esquemas viven en `src/lib/validation/*.ts` y se comparten.
Los de `orden.ts` y `filtros.ts` están en mi carpeta porque **no puedo escribir fuera de
ella**. Si la rejilla (artboard 03) acaba leyendo los mismos parámetros —y debería, porque
comparten `BarraFiltros`—, esto es una duplicación que hay que resolver moviendo
`leerFiltros`/`leerOrden` a `src/lib/validation/` en la integración.

---

## 2. Contradicciones · PNG ↔ regla. **Gana la regla**

### 2.1 La inicial de la miniatura en Cormorant 16 px

§04 dice «Miniatura 32 × 48, radio 3, **inicial en Cormorant 16 px**». Contradice de frente a
`design-tokens.md` y a DESIGN-SPEC §2: **«Cormorant nunca por debajo de 26 px»**.

Gana la regla, y además el caso no se da: `/api/covers/<id>` **siempre devuelve una imagen**
—cuando no hay portada, un placeholder SVG de laja negra generado al vuelo—, así que la
inicial no llegaría a verse nunca. La miniatura es un `<img>` a `/api/covers`, exactamente
como en `AnimeCard`.

### 2.2 `grid-template-columns` contra una `<table>` de verdad

§04 escribe los anchos como `grid-template-columns: 28px 44px 2fr 1.3fr 1.2fr 1.5fr .95fr
96px`, que es sintaxis de CSS Grid. El entregable nº 3 exige una `<table>` real, y una tabla
no entiende `fr`.

Traducción, hecha una vez en `columnas.ts` y con la proporción intacta: 2 / 1.3 / 1.2 / 1.5 /
.95 sobre 6.95 son 28.8 / 18.7 / 17.3 / 21.6 / 13.7 %, reescalados a 26 / 17 / 16 / 20 / 13 %
para dejar sitio a las tres columnas fijas. Las fijas llevan sumado el padding de fila
(20 px a cada extremo): 28 + 20 = 48 y 96 + 20 = 116.

### 2.3 `gap: 18px` y `padding de fila: 13/20`

Una tabla no tiene `gap`. Cada celda pone la mitad del hueco a cada lado (9 + 9 = 18) y los
extremos llevan los 20 px del padding de fila. El 13 vertical no se escribe: la fila mide
`h-[74px]` —el valor de §04— y el contenido se centra, que da el mismo resultado sin inventar
un espaciado fuera de la rejilla de 8.

### 2.4 Alto de la cabecera

El artboard mide ~34 px de cabecera. No es un token. Se usa `--e-5` (40 px), el valor de la
rejilla más cercano, con `--slate-850` y etiquetas de 11 px en `--gold-300`, que es lo que
§04 sí fija por nombre.

### 2.5 El título del artboard es «H2 de pantalla», pero aquí es un `<h1>`

§2 lo llama «H2 de pantalla» por su TAMAÑO (Cormorant 44 = `text-display-s`). En el documento
es el único encabezado —`BarraSuperior` no aporta ninguno—, así que el elemento es `<h1>`.
Un `h2` sin `h1` deja la página sin título para un lector de pantalla.

---

## 3. Supuestos sobre los datos

### 3.1 La primera columna de 28 px es la casilla de selección

En el PNG esa columna lleva los marcadores `⊙` de las anotaciones del artboard («reposo»,
«hover», «menú abierto»), no contenido real. La he interpretado como **casilla de
selección**, y es la interpretación que encaja con todo lo demás: §6 exige un estado
«fila seleccionada», el encargo lista `Casilla` entre las primitivas disponibles, y sin
casilla ese estado no tendría forma de alcanzarse.

La selección es **estado de cliente, no de URL**: marcar filas no cambia lo que se ve ni se
comparte pegando un enlace. Como todavía no hay acciones en lote, lo único que hace es
anunciar «N de M seleccionadas» en una región viva. **Se pierde al reordenar o filtrar**,
porque eso es una navegación del servidor; con acciones en lote habría que subirla a la URL o
a un contexto.

### 3.2 GÉNEROS: la columna existe, los datos no

`vault.listar()` devuelve `{ id, titulo, estado, esFavorito, anio, actualizadoEn,
checksumPortada, progresoEtiqueta }`. **Los géneros no viajan ahí**, y llegan con el
enriquecimiento (AniList + IA), que es otra fase.

La celda pinta `—` con un «Sin géneros» para el lector. No se inventan datos de los animes
del usuario, que es la tercera regla del proyecto. La columna se conserva porque §3 fija su
colapso por breakpoint y ese comportamiento sí es de esta pantalla.

### 3.3 La barra de progreso es INDETERMINADA

El artboard enseña «14/28 · 50 %» con la barra al 50 %. Del progreso, el listado solo trae
`progresoEtiqueta` —la etiqueta que escribió el usuario, que se pinta tal cual—, no su `kind`
ni sus números. Calcular un porcentaje a partir del texto sería inventarlo.

Se pinta la **pista sola, sin relleno**, que es exactamente el estado que `anime-vault-domain`
§4 define para `CUSTOM` y que §6 llama «vacío: pista sola, sin relleno». Para pintar el
relleno haría falta que `listar()` devolviera `progress.kind`, `season`, `episode`, `percent`
y `total_episodes`: un cambio en `src/lib/db/vault.ts`.

### 3.4 La segunda línea del título es el AÑO, no el título alternativo

El artboard pone el título alternativo debajo («Frieren: Beyond Journey's End»,
「ヴィンランド・サガ」). El listado no devuelve sinónimos ni títulos alternativos. Se pinta
`anio` —dato real— y, si es `null`, no se pinta nada.

### 3.5 Filtrar y ordenar se hacen en memoria, sobre UNA consulta

`vault.listar({ limite: 500 })` es **una** consulta con sus `LEFT JOIN` a portada y progreso,
y no trae los bytes de ninguna portada: solo el `checksum`, que es lo que necesita la URL
versionada. Filtrar y ordenar se aplican sobre esas filas ya traídas porque `listar()` no
acepta ni filtro ni orden, y añadírselos es tocar el vault.

**Consecuencia que hay que conocer:** con más de 500 animes el listado se trunca. La
paginación por keyset que pide `api-conventions.md` necesita cambios en el vault y no está.
Con los 83 reales no se nota.

---

## 4. Decisiones de implementación que conviene conocer

- **La cebra se calcula en JS, no con `odd:` / `even:`.** `odd:bg-…` y `hover:bg-…` son dos
  variantes con la misma especificidad: cuál gana depende del orden en que Tailwind las
  emita, y eso no debería decidir si el hover se ve. Con la cebra como clase base y el hover
  como variante, el orden está garantizado.
- **La veta dorada del hover va en la primera `<td>`, no en el `<tr>`.** Un borde sobre `tr`
  depende de `border-collapse` y del navegador; sobre la celda se pinta siempre, y
  `group-hover` la enciende desde la fila entera.
- **El título es `<th scope="row">`.** Es la cabecera de fila: hace que un lector diga
  «Mushishi, Estado, Visto» al recorrerla. También es lo que permite al e2e leer la columna
  de títulos por rol en vez de con `nth-child`, que se rompe en cuanto una columna se cae.
- **Sin `aria-selected` en el `<tr>`:** solo es válido sobre `row` dentro de un
  `grid`/`treegrid`, y esto es una `table` estática. La selección la anuncia la casilla real.
- **`loading.tsx`** pinta el esqueleto de 74 px por fila que pide §6. Al medir lo mismo que
  la fila real, la tabla no salta cuando llegan los datos.
- **La página no pinta `<main>`**: ya lo pone `src/app/app/layout.tsx`.
- Breakpoints: `movil:` `tablet:` `laptop:` `desktop:`. `sm:` `md:` `lg:` `xl:` están
  desactivados y compilan a cero; `columnas.test.ts` tiene un test que falla si alguno se
  cuela en una clase de visibilidad.

---

## 5. El recorrido en navegador · `e2e/vista-lista.spec.ts`

**No lo he ejecutado.** El encargo prohíbe expresamente `npm run build`, `npm run dev` y
`npx playwright test` porque hay otros dos agentes compartiendo el mismo `.next`. Lo que sí
está ejecutado y en verde: `tsc --noEmit`, `eslint`, `lint:tokens` y los tests de unidad.

### 5.1 Los datos vienen de la cuenta sembrada, y no hay alternativa

El recorrido con datos entra con `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` de `.env.local`
(el spec carga ese fichero con `dotenv`; Playwright no lo hace solo).

**No hay otra forma hoy**: la pantalla para añadir un anime es el artboard 06 y todavía no
existe, así que un usuario recién registrado no puede tener ni una serie por ningún camino de
la interfaz. Si esas variables faltan, ese test se salta **con el motivo escrito**; lo que no
depende de los datos —el vacío del vault nuevo, el registro dejando en blanco lo opcional, la
recarga, el botón de atrás, la protección de la ruta sin sesión— se comprueba igual.

### 5.2 Por qué el recorrido largo es UN SOLO test

Cada `test` de Playwright abre un contexto limpio, y eso es **un login más**. El login está
limitado a **5 intentos / 15 min por correo** (`security.md` §5). Trocear el recorrido en seis
tests haría que la suite se autobloqueara al segundo intento del día contra la misma cuenta.
Los pasos van en `test.step`, así que el informe dice cuál falló.

### 5.3 Una precondición que puede fallar por datos, y está puesta a propósito

El paso del filtro sin resultados pulsa el chip **Abandonado** y antes comprueba que su
recuento es `0`. Los 83 del seed son `VISTO`, así que hoy lo es. Si algún día el vault
sembrado tuviera un abandonado, el test falla **en esa línea** y se lee por qué, en vez de
fallar más abajo con un mensaje que no diría nada.

### 5.4 Qué comprueba, punto por punto

| Requisito del encargo            | Cómo se comprueba                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Entrar como una persona          | formulario de login real; registro real en el test del vault nuevo, **dejando el nombre en blanco**                        |
| La tabla se pinta                | `role="table"`, cabeceras por rol, más de una fila                                                                         |
| Miniaturas desde `/api/covers`   | se interceptan **todas** las peticiones de imagen; ninguna puede salir de otro origen                                      |
| Ordenar cambia el orden Y la URL | `?orden=titulo&dir=asc`, `aria-sort`, y descendente = inversa EXACTA de ascendente (no depende del locale ni de los datos) |
| Volver atrás                     | `goBack()` y el orden anterior vuelve, fila a fila                                                                         |
| Recargar con el orden puesto     | `reload()` y la URL y el orden aguantan                                                                                    |
| Filtro sin resultados            | chip «Abandonado» → «Sin resultados» y **cero tablas**                                                                     |
| A 390 px no hay tabla, sí cards  | `table` oculta (CSS) y ausente del árbol de accesibilidad; `article` visible; `scrollWidth − clientWidth ≤ 0`              |
| Colapso por breakpoint (§3)      | a 1500 están Géneros y Actualizado; a 1200 se cae Géneros; a 900 se cae Actualizado                                        |
| Sin `bypassCSP`                  | no se toca la política, y se recoge la consola: cualquier bloqueo pone el test en rojo                                     |

---

## 6. Verificación ejecutada

```
npx tsc --noEmit          exit 0
npm run lint              exit 0
npm run lint:tokens       exit 0   (173 ficheros, ningún color literal)
npx vitest run src/app/app/lista   3 ficheros, 60 tests en verde
```

`npm run build` y `npx playwright test` **no** se han ejecutado: prohibidos por el encargo
mientras haya otros agentes compartiendo el `.next`.
