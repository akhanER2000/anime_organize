# SUPUESTOS · Ficha de anime (artboard 05)

Ruta: `/app/anime/<uuid>` · Carpeta: `src/app/app/anime/[id]/`

Todo lo que no salía literal de `design/` ni de las reglas, y cada sitio donde el PNG y
una regla decían cosas distintas. **Cuando el artboard y la regla se contradicen, gana la
regla** (`design-tokens.md` Regla 0 y el orden de autoridad de `CLAUDE.md`).

---

## 1. PARADAS · lo que no se pudo hacer sin saltarse una prohibición

Ninguna de estas se resolvió a la brava. Se implementó lo que sí era alcanzable, se dejó el
estado vacío honesto, y aquí queda escrito qué falta y **dónde** hay que tocarlo.

### 1.1 · No hay forma de leer la fila de `progress`. **La barra no puede tener relleno.**

`vaultDe(ctx)` expone `listar()`, `obtener()`, `contar()`, `portada()` y
`enlaceMasReciente()`. De la tabla `progress` solo llega **`label`**, y solo dentro de
`listar()`. **`kind`, `season`, `episode` y `percent` no son alcanzables desde ninguna
pantalla.**

`anime-vault-domain` §4 dice que el relleno depende **exactamente** de esos campos. Sin
ellos, lo único cierto es «no se sabe», y eso en el sistema es la barra **indeterminada**:
pista sola, sin relleno (DESIGN-SPEC §6, columna «vacío»). Poner `0` diría «no ha visto
nada» y poner `100` diría lo contrario; las dos serían inventadas.

- La lógica **sí está implementada y testeada**: `progreso-barra.ts` cubre las cinco filas
  de la tabla de la skill, con 24 tests (`progreso-barra.test.ts`), incluidos los límites
  que rompen una barra (total `0`, episodio por encima del total, `NaN`, infinitos).
- Está **conectada al camino real**: `page.tsx` la llama en el único sitio donde se decide
  el relleno. Hoy recibe `null` porque eso es lo que hay.
- **Qué falta:** un método en `src/lib/db/vault.ts` —fuera de mi carpeta— del estilo
  `progreso(animeId): Promise<{ kind, season, episode, percent, label } | null>`.
  Cuando exista, cambia **una línea** de `page.tsx`.

> **Hallazgo, y merece revisarse aparte:** `progress` está **vacía en la base**.
> `scripts/seed.ts` calcula `mapearProgresoDelSeed(fila.progresoTipo, fila.progresoEtiqueta)`
> y **descarta el resultado**: solo lo usa para reportar tipos desconocidos. No lo inserta,
> y no puede, porque el vault tampoco tiene con qué escribirlo. Así que los 69 `COMPLETO`,
> los 4 `T1` y los 10 `EN_PROCESO` del seed **no están en Postgres**, y `progress.label`
> sale `null` para los 83 animes. No es un fallo de esta pantalla, pero es la razón por la
> que hasta la etiqueta de progreso sale vacía.

### 1.2 · Los géneros y las etiquetas de IA no son alcanzables (y además no existen)

`anime_genre` no se puede consultar: el vault no la expone. Y aunque se pudiera, está
vacía — el enriquecimiento es otra fase, como avisaba el encargo.

- `chip-genero.tsx` **sí implementa la distinción** que piden §05 y la skill §6: oficial con
  borde sólido `--gold-borde` y texto `--gold-300`; IA con borde **punteado**, texto
  `--gold-500` y prefijo `✦` (más un `sr-only`, porque el origen no puede comunicarse solo
  con un borde y un símbolo).
- La lista que recibe es una constante vacía en `page.tsx`, con su comentario. **No se
  inventa ni una etiqueta.**
- **Qué falta:** `vault.generos(animeId)` y datos.

### 1.3 · El `checksum` de la portada solo se consigue pidiendo el listado entero

Para la URL versionada `/api/covers/<id>?v=<checksum>` hace falta el checksum.
`obtener()` devuelve la fila de `anime`, que no lo lleva; `portada()` lo lleva pero
**selecciona los bytes**, que son cientos de KB que la pantalla no necesita (la imagen la
pide el navegador aparte).

La única consulta que expone `checksum` sin bytes es `listar()`. Así que la ficha pide el
listado y busca su fila. Va filtrado por usuario como todo, son 83 filas de columnas
cortas, y **es un apaño**.

- **Qué falta:** `vault.ficha(animeId)` que devuelva anime + checksum + progreso en una
  consulta. Resolvería también 1.1.
- **Por qué no se omitió el `?v=`:** la respuesta de `/api/covers` es
  `private, max-age=31536000, immutable`. Sin el checksum en la URL, cambiar la portada no
  se vería **nunca** en el navegador del usuario.

### 1.4 · Las acciones del artboard no existen, y no se pintan botones que no hacen nada

El PNG dibuja `−` / `+` de episodio, «Marcar como visto», «★ Favorito», «✎ Editar» y
«+ Añadir un enlace». Ninguna tiene Server Action, y escribirlas significaría crear
mutaciones fuera de mi carpeta (y, en el caso de editar, el modal del artboard 06).

**No están.** Un botón que se ve y no responde es peor que su ausencia: la persona lo pulsa,
no pasa nada, y concluye que la aplicación está rota.

Lo que sí se pinta de esos datos es lo que es **información y no acción**: si el anime es
favorito, sale como marca junto al badge de estado.

### 1.5 · «Dónde verlo» (sitios y espejos V1/V2/V3) no está

`streaming_site` y `streaming_mirror` no son alcanzables desde el vault. La sección del
artboard se omite entera. Los chips `ChipEspejo` ya existen en `@/components/ui/chip` para
cuando haya datos.

### 1.6 · «Estudio» no es una columna del esquema

El artboard lista «Estudio · Madhouse». `anime` no tiene ese campo. No se inventa una fila
vacía: `metadatosDeFicha` solo devuelve lo que existe.

### 1.7 · `Boton` no acepta `href`, y esta pantalla tiene dos acciones que NAVEGAN

`components/ui/boton.tsx` renderiza siempre un `<button>` y sus mapas de clases son
privados del módulo. La acción de continuar va a un sitio externo y el botón del 404 va a
`/app`: los dos tienen que ser `<a>` de verdad (clic central, copiar dirección, arrastrar a
marcadores, funcionar con JavaScript caído).

El aspecto se reconstruye en `aspecto-boton.ts` a partir de los mismos tokens y la misma
fila de DESIGN-SPEC §6, compuesto sobre la primitiva `Enlace` —que sí aporta la guarda del
`href` y el `rel="noopener noreferrer"`—. **Es la misma deuda que ya declaró la landing en
`boton-enlace.tsx`: van dos pantallas pagándola.** El día que `Boton` acepte `href` (o
exporte sus mapas), los dos ficheros se borran.

### 1.8 · La miga de pan del artboard vive en la barra superior, que no es mía

El PNG pone `/ biblioteca / Sousou no Frieren` dentro de la barra de arriba.
`BarraSuperior` la monta `/app/layout.tsx` y solo acepta `buscador` y `accion`: una
pantalla no puede inyectarle contenido. La miga se pinta como **primer elemento del
contenido** de la ficha, con la misma tipografía mono y el mismo enlace a la biblioteca.

---

## 2. Contradicciones PNG ↔ regla · gana la regla

| Dice el artboard / la spec                                                                | Qué se hizo                                                    | Por qué                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §05: títulos alternativos en **mono 13 px**                                               | `text-mono` (12)                                               | La escala mono del sistema es 14 / 12 / 11 (`design-tokens.md`). 13 no existe y no se inventa un token.                                                          |
| §05: gap de **5 px** entre esos títulos                                                   | `--e-05` (4)                                                   | La rejilla es de 8; 4 es el escalón declarado que cae al lado.                                                                                                   |
| §05: marco de la portada con **10 px de aire**                                            | `--e-1` (8)                                                    | Mismo criterio que el panel de arte de la landing, que también pedía «10 px» y usó `--e-1`. Dos pantallas, un solo valor.                                        |
| §2: cuerpo largo con **interlineado 1.75**                                                | `leading-cuerpo-l` (1.8) con `text-cuerpo-l` (17)              | Los tokens de interlineado son 1.7 y 1.8. 1.75 no existe.                                                                                                        |
| §11: el **404 en 96 px** Cormorant                                                        | `text-hero` (84) desde tablet · `text-display-m` (56) en móvil | La escala display termina en `hero` = 84. En 390 px, 84 px ya ocupa media pantalla.                                                                              |
| §05: título de ficha **64 px** fijo                                                       | 34 / 44 / 56 / **64** por breakpoint                           | 64 px en 390 px de ancho deja un título de cuatro líneas. Se baja por la escala display sin salirse de ella y **sin bajar de 26**, que es el suelo de Cormorant. |
| El PNG dibuja la card de progreso **rodeada de oro**                                      | `Card acento` (borde superior `--gold-400`)                    | §05 dice, en texto, «borde superior `--gold-400`». Y un recuadro dorado completo alrededor de una card, con el botón sólido dorado al lado, sería oro sobre oro. |
| El PNG muestra **28 episodios, 2023–2024, Madhouse, #154587, tres enlaces, seis géneros** | Estados vacíos honestos                                        | Son datos de ejemplo del tablero. Los reales salen de la base y hoy no están (tercera regla del proyecto).                                                       |
| §05: barra superior de **64 px**                                                          | La del layout, 72 px (`--e-9`)                                 | No es de esta pantalla. Anotado por si el desajuste importa.                                                                                                     |
| El PNG separa «Emisión **2023 – 2024**»                                                   | Un solo año                                                    | `anime` tiene `year`, no un rango. Inventar el año final sería inventar un dato.                                                                                 |

---

## 3. Supuestos de implementación

1. **`display: contents` para el orden de lectura en móvil.** La ficha son dos columnas
   (portada + acciones | contenido) que en una sola columna tienen que **intercalarse**:
   portada → título → acción de continuar → progreso → géneros → sinopsis → datos. Las dos
   columnas se declaran `contents` hasta laptop, sus hijos pasan a ser celdas de la rejilla
   de una columna, y `order-*` los ordena; desde laptop las columnas vuelven a existir y
   manda el DOM, que ya es el orden del artboard.
   La alternativa —duplicar los bloques y ocultar uno con `hidden`— dejaría dos copias del
   mismo texto en el árbol de accesibilidad y en el HTML.
2. **La portada lleva `alt=""`.** Es decorativa: el título va en el `<h1>` justo al lado, y
   un `alt` con el título lo repetiría en el lector de pantalla. Misma decisión que
   `AnimeCard`.
3. **El montaje de −42 px del contenido sobre la portada (§12) NO se implementó.** 42 px no
   es un token, y solapar el título sobre la imagen a sangre choca con el badge de estado y
   con la miga de pan. Lo que sí está es el **degradado a `--slate-950`** sobre el corte
   inferior de la imagen, que es lo que hace que la portada funda con el fondo. Si el
   solape importa, es un cambio de una clase y merece decidirlo mirando el render.
4. **El relleno de la barra se redondea a entero.** Viaja al `width` en CSS y al
   `aria-valuenow`: medio píxel en una barra de 2 px no se ve, y «treinta y tres coma tres
   tres tres por ciento» dicho por un lector de pantalla es ruido.
5. **Las fechas se formatean con `timeZone: "UTC"` fijado.** Se renderizan en el servidor;
   sin fijar la zona, un anime añadido de madrugada aparecería con un día en Vercel y otro
   en local, y el test no podría afirmar nada estable.
6. **El id de la ruta se parsea con Zod antes de tocar la base.** Sin eso, `/app/anime/hola`
   hace que Postgres responda `invalid input syntax for type uuid` y eso sube como **500**:
   la pantalla de error genérica en vez del 404 usable, y una traza del driver por cada
   visita de un bot. `api-conventions.md` lo exige para los parámetros de ruta.
7. **Una sesión revocada redirige a `/login`, no revienta.** `exigirSesionParaLeer()` lanza
   `ErrorSesionInvalida`; en una pantalla eso es «vuelve a entrar», no un 500. Cualquier
   otro error se relanza: un fallo de infraestructura disfrazado de «vuelve a iniciar
   sesión» manda al usuario a teclear su contraseña para nada.
8. **`cache()` de React alrededor de la carga.** `generateMetadata` y el componente piden lo
   mismo en la misma petición. Sin memoizar serían dos rondas completas —sesión incluida—
   para pintar una pantalla. El ámbito de `cache` es la petición, así que no puede servirle
   a nadie la ficha de otro.
9. **El título de la pestaña es el del anime.** Y cuando no hay ficha, «No encontrado» —el
   mismo para «no existe» y para «no es tuyo», porque la pestaña tampoco puede delatarlo.

---

## 4. El recorrido en navegador · `e2e/ficha-anime.spec.ts`

Chromium, contra `build` + `start`, **sin `bypassCSP`**. Once tests (nueve declaraciones,
tres de ellas generadas en bucle, una por caso de basura).

- **Se llega navegando**, pulsando la primera card de la biblioteca. No se escribe la URL:
  si el enlace de la card se rompiera, un test que teclea la dirección seguiría verde y la
  pantalla sería inalcanzable para una persona.
- **La portada sale de `/api/covers`** y **ninguna petición de imagen sale a otro dominio**,
  comprobado **interceptando la red** (un `<img>` correcto y un `<link rel=preload>` al
  dominio original se ven igual en el DOM). Se comprueba también que la URL lleva su `?v=`.
- **404 con código de estado de verdad** para un uuid inexistente, y la pantalla es usable:
  se pulsa «Volver a la biblioteca» y se llega.
- **404 para basura en vez de un uuid** (tres casos, un test cada uno): es el «equivocarse»
  de una pantalla sin formulario, donde lo que escribe cualquiera es la dirección.
- **El anime de OTRA persona responde 404 idéntico** —mismo estado, mismo texto de `main`,
  mismo título de pestaña— que uno inexistente. Es la comprobación de seguridad de esta
  pantalla, y va por el **camino real**: navegador, registro real, cookie emitida por el
  servidor, middleware y consulta de verdad. Lleva anotada su mutación:
  quitar `mias()` del `WHERE` de `vault.obtener` lo pone en rojo.
- **Volver atrás** deja la biblioteca usable —y «usable» se comprueba **volviendo a pulsar
  una card**, no solo mirando que el `<h1>` está—.
- **Recargar** la ficha.
- **A 390 px**: sin scroll horizontal, y la portada **a sangre** medida de verdad (`x ≤ 1` y
  ancho ≥ el de la ventana). Si alguien cambia el padding lateral y olvida el margen
  negativo, esto lo ve.

### El caso «dejar en blanco lo opcional»

La ficha **no tiene formulario**: es una pantalla de lectura. El caso que exige
`testing.md` —y que se coló una vez en producción, con `EsquemaNombre` convirtiendo `""` en
`null`— se recorre por el camino que la propia pantalla necesita: el test del anime ajeno
**crea una cuenta dejando el nombre EN BLANCO** y la envía. Es el mismo criterio que usó la
landing, que tampoco tiene formulario propio.

### Dependencias del spec, dichas claramente

1. **Necesita `SEED_OWNER_EMAIL` y `SEED_OWNER_PASSWORD` en `.env.local`**, y el vault
   sembrado. Una cuenta nueva tiene el vault vacío: no hay biblioteca desde la que navegar,
   ni portada que interceptar, ni ficha que pintar. Es el mismo supuesto —y la misma
   justificación— que `e2e/biblioteca.spec.ts`.
2. **Depende de la biblioteca (`/app`)**, que la escribe otro agente en paralelo. Se apoya
   solo en su contrato accesible: la lista `Tus series`, sus `listitem`, el `<h3>` con el
   título y el enlace de la card (que es de `AnimeCard`, compartida). Si esos nombres
   cambian, el spec hay que ajustarlo.
3. **No se ha ejecutado.** El encargo lo prohíbe expresamente mientras haya otros agentes
   trabajando sobre el mismo `.next`. Está escrito, tipa y pasa el lint; **el verde real
   está pendiente de la integración**.

---

## 5. Lo que esta pantalla NO hace, resumido

Para que nadie lo busque: no edita, no marca favorito, no suma episodios, no marca como
visto, no añade enlaces, no lista sitios de streaming ni espejos. No hay ninguna mutación en
esta carpeta. Es una pantalla de **lectura**, y lo que se ve de ella es exactamente lo que
la base sabe hoy.
