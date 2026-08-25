# SUPUESTOS · Biblioteca en rejilla (artboard 03)

Ruta `/app`. Lo que sigue es lo que decidí y por qué, lo que el PNG y las reglas
dicen distinto —y gana la regla—, y dónde paré.

---

## PARADAS · lo que no se puede terminar desde esta carpeta

### 1. El vacío del vault se queda SIN botón de borde dorado

DESIGN-SPEC §08 y el encargo piden que el estado vacío lleve «icono de laja +
H3 + párrafo + **botón de borde dorado**». Están los cuatro elementos en el vacío
del **filtro** («Quitar los filtros», que navega a `/app` y funciona hoy).

En el vacío del **vault** no hay botón, y es deliberado: la única acción que
tendría sentido ahí es «Añadir anime», y hoy **no existe ningún destino**.

- El modal de alta es el artboard 06, que no está escrito.
- `src/app/app/layout.tsx` renderiza `<BarraSuperior />` **sin** `accion`, así
  que ni siquiera el botón sólido de la barra está cableado.
- No hay ruta ni Server Action de alta en todo el repositorio.

Un botón que no lleva a ningún sitio es peor que su ausencia: promete algo que
la aplicación no hace. Inventarme `/app/anime/nuevo` habría sido inventarme una
ruta —y además chocaría con `/app/anime/[id]`, que sí existe—.

**Decide tú:** (a) cableo el botón a la ruta que le des, (b) lo dejo así hasta
la fase del modal. Es un cambio de tres líneas en `vacio.tsx`.

### 2. La barra de progreso no puede tener relleno con los datos que hay

`vault.listar()` devuelve `progresoEtiqueta` y **nada más** del progreso: ni
`kind`, ni `episode`, ni `season`, ni `total_episodes`. `anime-vault-domain` §4
calcula el relleno a partir de esos campos, así que sin ellos **no hay
porcentaje que pintar**, y deducirlo del texto de la etiqueta sería inventarse
el progreso del usuario (tercera regla del proyecto).

La barra se pinta igualmente, con la primitiva del sistema y en su estado
«vacío» de DESIGN-SPEC §6 —«pista sola, sin relleno»—, que es exactamente lo que
el sistema define para un progreso indeterminado. En `ABANDONADO` la pista va en
granate sin halo.

Además, **en la base de desarrollo la tabla `progress` está vacía**: los 83
animes del propietario no tienen ni una fila de progreso, así que hoy la
etiqueta también sale `null` en las 83 cards. El artboard dibuja «EP 14/28 ·
50 %» porque sus diez animes son de ejemplo.

**Para que la barra se llene** hace falta que `listar()` devuelva el progreso
completo. Eso es una consulta del vault (`src/lib/db/vault.ts`), que no es mía.

### 3. Un `npm run format` mío tocó un fichero de otra pantalla

Ejecuté `npx prettier --write src/app/app/` y reformateó
`src/app/app/lista/tabla-lista.tsx`, que es del agente de la vista lista
(artboard 04) y estaba sin formatear. **Solo formato, sin cambios de
comportamiento**, pero si ese agente estaba a mitad de una edición, conviene que
lo sepa. A partir de ahí formateé fichero a fichero.

---

## Contradicciones PNG ↔ regla · gana la regla

| Lo que dibuja el artboard 03                                                       | Lo que hace la pantalla                | Por qué                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contador «10 de 10 series»                                                         | «83 de 83 series» (lo que haya)        | El artboard fija la FORMA, no la cifra. Sus diez animes son de ejemplo; el contador es real.                                                                                                                                                      |
| Títulos Frieren, Vinland Saga, Mushishi…                                           | Los 83 títulos reales del vault        | «No se inventan datos de los animes del usuario.»                                                                                                                                                                                                 |
| Badges variados (Viendo, Visto, En espera, Abandonado)                             | Los 83 salen `VISTO`                   | Es el estado real del seed. La pantalla pinta lo que hay.                                                                                                                                                                                         |
| Barras de progreso rellenas al 50 %, 79 %, 100 %                                   | Pista sola, sin relleno                | Ver PARADA 2.                                                                                                                                                                                                                                     |
| Selects «Género · Año · Formato» en la barra de filtros | No están                               | Son de `BarraFiltros` (`src/components/anime/`), que **no me toca editar** y hoy solo trae los chips de estado y favoritos.                                                                                                                       |
| «Añadir anime» (relleno dorado) y buscador en la barra superior                    | No están                               | Los pone `layout.tsx`, que **no es mío**, y hoy los renderiza vacíos. Consecuencia: esta pantalla no tiene ningún botón de relleno dorado, lo cual **cumple** la regla del oro nº 3 (máximo uno).                                                 |
| «Ordenar por · última actualización» con una flecha de desplegable                 | Texto mono, sin flecha, no interactivo | `listar()` ordena siempre por `updated_at DESC` y no acepta otro criterio. Un desplegable que no despliega promete algo que no existe; el texto describe el orden que de verdad se aplica.                                                        |
| Padding vertical del contenido 36 px                                               | 32 px (`--e-4`)                        | 36 px no está en la rejilla de 8 ni en `tokens.css`, y `design-tokens.md` prohíbe escribir un valor que no sea un token. `--e-4` es el que cae al lado. Si el diseño lo quiere exacto, se añade `--e-4-5` a `tokens.css` y lo cambio.             |
| «H2 40 px» para «Tu biblioteca»                                                    | `<h1>` con `text-display-xs` (40 px)   | «H2 40 px» es el ROL tipográfico de DESIGN-SPEC §2, no el nivel del documento. Es el único titular de la pantalla: si fuera `<h2>`, la página se quedaría sin encabezado principal (§7, accesibilidad). El tamaño y el peso son los del artboard. |

---

## Decisiones de implementación

### Una consulta, y el filtrado en memoria

`vault.listar({ limite: 500 })` trae el vault entero con su portada y su
progreso en un solo `JOIN` y **sin los bytes** (solo el `checksum`). Los 83
recuentos de los chips y el filtrado se calculan sobre ese array.

Filtrar en SQL sería una **segunda** consulta para descartar filas que ya están
en memoria, y los recuentos de los chips son del vault **entero** —«Abandonado 1»
sigue diciendo 1 mientras miras solo los favoritos—, así que hacen falta todas
las filas de todos modos.

**El día que duela** (miles de animes) la respuesta no es filtrar mejor aquí: es
añadir el filtro y un `count` agrupado **al vault**, paginar por keyset
(`api-conventions.md`) y dejar de traerlo todo. El `LIMITE_LISTADO = 500` está
escrito con nombre para que se vea que esta pantalla **no pagina**.

### Los recuentos de los chips son del vault entero, no de lo filtrado

Si el chip «Viendo» pasara a 0 al filtrar por «Visto», los chips dejarían de
servir para navegar: serían un espejo de la selección. Es lo que dibuja el
artboard (los recuentos suman el total) y lo que hace usable una faceta múltiple.

### Dos vacíos distintos, y no es un capricho

- **Vault sin animes** → «Tu vault está vacío».
- **Filtro sin resultados** → «Ninguna serie coincide», con el filtro citado, el
  contador diciendo `0 de 83 series` y la salida «Quitar los filtros».

Decirle «tu vault está vacío» a quien acaba de leer «83 series» es hacerle creer
que ha perdido sus datos. El e2e comprueba explícitamente que el segundo caso
**no** muestra el texto del primero.

### Estados válidos: solo el literal exacto

`?estado=visto` (minúsculas) **no** filtra. Solo entran los cinco literales de
`ESTADOS`. Es lo que escribe `BarraFiltros` al construir sus enlaces, y aceptar
variantes obligaría a decidir qué más se acepta (`Visto`, `VISTO ` con espacio,
acentos…) sin ninguna regla que lo respalde. Ante la duda, no se filtra: se ve
todo, que es el resultado inofensivo.

Igual con `favorito`: solo el `1` exacto activa.

### `<Suspense>` alrededor de `BarraFiltros`

`BarraFiltros` usa `useSearchParams()`, y Next exige una frontera de suspensión
alrededor de cualquier cliente que lo haga o **el build falla** al intentar
prerenderizar la ruta. Hoy no puede pasar porque `export const dynamic =
"force-dynamic"` la deja siempre dinámica, pero eso es una línea de `page.tsx`:
sin el `<Suspense>`, quitarla rompería el build con un error que aparece lejos
de aquí.

### Un enlace con aspecto de botón, otra vez

`components/ui/boton.tsx` renderiza siempre un `<button>` y sus mapas de clases
son privados del módulo. «Quitar los filtros» **navega**, así que tiene que ser
un `<a>`. La apariencia se reconstruye en `medidas.ts` con los mismos tokens y
la misma fila de DESIGN-SPEC §6.

Es exactamente el mismo camino que tuvo que tomar la landing
(`src/app/(publico)/landing/boton-enlace.tsx`). **Van dos pantallas**: el día que
`Boton` acepte `href` —o exporte sus mapas—, las dos copias se borran. Merece la
pena mirarlo antes de que sean cinco.

### `min-w-0` en la celda de la rejilla

Una celda de rejilla vale por defecto lo que su contenido mínimo
(`min-width: auto`), así que un título con una palabra muy larga ensancharía la
columna y sacaría scroll horizontal en móvil. El token más largo de los 83
títulos reales es `Sakebitagatterunda.` (19 caracteres), que a 390 px todavía
cabe — pero eso depende de los datos, y el `min-w-0` no.

---

## El recorrido en navegador

`e2e/biblioteca.spec.ts`, Chromium, contra `build` + `start`, **sin
`bypassCSP`**. **No lo he ejecutado**: comparto el `.next` con otros dos agentes
y dos compilaciones a la vez lo corrompen.

Cubre: que la rejilla se pinta con la CSP puesta · que el contador y los
recuentos cuadran · que **todas** las portadas salen de `/api/covers` y **ninguna
petición de imagen sale a otro dominio** (interceptando la red) · que los chips
filtran y cambian la URL · que el botón de atrás devuelve el filtro anterior ·
que recargar lo mantiene · el vacío de un filtro sin resultados · una URL con
basura · 390 px sin scroll horizontal · y el vacío de un vault recién creado.

Cosas que conviene saber antes de ejecutarlo:

1. **Necesita `SEED_OWNER_EMAIL` y `SEED_OWNER_PASSWORD` en `.env.local`.** Una
   cuenta nueva tiene el vault vacío: sin los 83 animes reales no hay rejilla que
   pintar, ni portadas que interceptar, ni recuentos que comprobar. Si faltan,
   el `beforeAll` falla con ese mensaje en vez de con un error críptico.
2. **Un solo login para todo el fichero.** `security.md` §5 limita el login a
   5 intentos / 15 min por email. Un `beforeEach` con login habría agotado el
   cubo a mitad de la tanda y el 429 se habría leído como un fallo de la
   pantalla. Se entra una vez y se comparte la pestaña (`mode: "serial"`).
3. **El test de las portadas abre una pestaña con la caché fría**, reutilizando
   las cookies de la sesión ya iniciada (`storageState`). `/api/covers` responde
   `immutable` durante un año: en la pestaña compartida las portadas saldrían de
   la caché del navegador y **no habría ni una petición de red que interceptar**,
   así que el test pasaría sin haber mirado nada. No gasta un login extra.
4. **El test del vault vacío registra una cuenta.** `registro:ip` está limitado a
   5 / hora y `e2e/auth-humo.spec.ts` ya registra otra. Ejecutar la suite entera
   más de dos veces en la misma hora puede topar con ese límite; no es un fallo
   de la pantalla.
5. **AVISO PARA LA INTEGRACIÓN: tres specs entran con la MISMA cuenta.**
   `biblioteca.spec.ts`, `ficha-anime.spec.ts` y `vista-lista.spec.ts` hacen un
   login cada uno con `SEED_OWNER_EMAIL`. Son 3 de los 5 intentos que permiten
   los 15 minutos de `login:email`. Una sola pasada cabe holgada; **dos pasadas
   completas dentro del mismo cuarto de hora agotan el cubo** y el cuarto login
   recibirá un 429 que se leerá como un fallo de pantalla, no como lo que es.
   Si hace falta iterar, o se espera, o se comparte un `storageState` entre los
   tres ficheros desde un `globalSetup` — que es la solución de verdad, pero
   toca `playwright.config.ts`, que no es de ninguna pantalla.
6. **Los estados se eligen leyendo la pantalla**, no clavados en el test: se
   busca «el primer estado con recuento > 0» y «el primero con recuento 0». Hoy
   los 83 son `VISTO`, así que el filtro sin resultados sale por cualquiera de
   los otros cuatro; el día que eso cambie el test sigue valiendo.

## Los tests de unidad

`src/app/app/(biblioteca)/filtros.test.ts` — 28 casos sobre `filtros.ts`, que es lógica pura
en un `.ts` porque **Vitest corre en `node` y no transforma `.tsx`**. Cubre lo
que `testing.md` §Nivel 2 pide con nombre y apellidos: «esquemas Zod de filtros:
`searchParams` con basura no rompe la página». No se testea que Tailwind aplique
una clase ni que Next renderice un `<div>` (§Nivel 3): para eso está el e2e.

## Lo que NO hace esta pantalla

- No busca (el buscador es el artboard 08 y lo pone el layout).
- No ordena por otro criterio: `listar()` ordena por `updated_at DESC`.
- No pagina.
- No filtra por género, año ni formato: esos chips no existen en `BarraFiltros`.
- No abre el modal de añadir: es el artboard 06.
- No pinta el overlay de acciones al pasar por encima de la portada
  (`▶ ✎ ★`, DESIGN-SPEC §5). Está dentro de `AnimeCard`, que no me toca.


---

## Nota de integración — por qué la biblioteca vive en `(biblioteca)`

Los seis ficheros de esta pantalla (`page.tsx`, `loading.tsx`, `filtros.ts`,
`filtros.test.ts`, `medidas.ts`, `rejilla.tsx`, `vacio.tsx`) se movieron de
`src/app/app/` a `src/app/app/(biblioteca)/`. Es un **grupo de ruta**: no cambia
la URL, `/app` sigue siendo `/app`.

El motivo no es de orden. `loading.tsx` estaba en `src/app/app/`, y desde ahí
envolvía en un `<Suspense>` **todo el subarbol** —incluida `/app/anime/[id]`—.
Un `<Suspense>` autoriza a Next a vaciar la cabecera de la respuesta con **200**
antes de que la página termine, así que el `notFound()` de la ficha llegaba
cuando el estado ya había viajado: **un anime inexistente respondía 200**, con
el cuerpo correcto y el código equivocado.

Eso rompe `security.md` §1, que responde 404 y nunca 403 justamente para que no
se distinga «no existe» de «no es tuyo». Con 200 en los dos casos, quien
enumera no necesita ni leer el cuerpo.

Dentro del grupo, el esqueleto de esta pantalla se conserva —que es donde de
verdad hace falta: la consulta trae 83 filas— y ya no alcanza a la ficha.
`src/app/app/anime/[id]/sin-loading.test.ts` lo fija, con el mensaje que explica
la causa por si alguien vuelve a añadir un `loading.tsx` ahí arriba.


## Cerrado en la integración — 2026-08-24

- **El conmutador rejilla/lista ya existe.** Vive en `BarraFiltros` como
  `ConmutadorDeVista`, son dos enlaces y conservan los `searchParams`. Los selects de
  «Género · Año · Formato» siguen sin estar: necesitan los géneros, que llegan con el
  enriquecimiento.
- **Los filtros ya no se parsean aquí.** `parsearFiltros`, `filtrarFilas`, `contarPorEstado`
  y `contarFavoritos` viven en `src/lib/validation/biblioteca.ts`, compartidos con la vista
  lista, que traía su propio parseador con dos comportamientos distintos. En esta carpeta
  solo quedan `textoContador` y `describirFiltros`, que son textos de esta pantalla.
