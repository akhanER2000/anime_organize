# Supuestos · LANDING (artboard 02)

Todo lo que tuve que decidir, y por qué. El orden es el de gravedad: primero donde el PNG
y las reglas se contradicen, después lo que no estaba decidido, y al final las paradas del
contrato.

---

## 1. Contradicciones entre el PNG y las reglas · **gana la regla**

### 1.1 El velo del hero llevaba un tramo al 55 %

El artboard dibuja el velo diagonal como `linear-gradient(105deg, void .96, void .55, void .86)`.
`design-tokens.md` dice, sin matices: «La laja fotográfica … siempre bajo un velo de `--void`
al **86–97 %**». El tramo del 55 % está muy por debajo del suelo.

**Hecho:** el velo va a 96 % → 86 % → 88 %. La laja se lee menos que en el PNG en la franja
central-derecha, justo detrás del panel de arte. `hero.tsx`, constante `VELO_HERO`.

Efecto secundario asumido: sin `rgba()` —`lint:tokens` lo prohíbe en todo el proyecto— el
alfa se consigue con `color-mix(in srgb, var(--void) N%, transparent)`, que es lo que ya hace
`--velo-auth` en `globals.css`.

### 1.2 La captura enmarcada: ocho huecos dibujados, «5 columnas» escrito

El PNG dibuja **ocho** huecos de portada y su propio pie dice «Vista rejilla · **5 columnas**
a tamaño real». Se contradicen entre sí. DESIGN-SPEC §3 —normativa— fija la rejilla de
portadas en **5 · 4 · 3 · 2** columnas (desktop · laptop · tablet · móvil).

**Hecho:** 5 columnas en desktop, bajando por breakpoint. Se pintan cinco huecos y se ocultan
los sobrantes en cada anchura, para que la fila quede siempre completa.

Razón de fondo, además de la jerarquía de autoridad: con cinco columnas cada hueco mide
~230 px y el pie —«a tamaño real»— **es verdad** (la referencia de §5 son 253 px). Con ocho
mediría 140 px y el pie sería falso. Copiar el dibujo obligaba a dejar una mentira en la
interfaz.

### 1.3 Cormorant por debajo de 26 px, en tres sitios

`design-tokens.md`: «**Cormorant nunca por debajo de 26 px**». El sistema tiene **una sola
excepción declarada**, y está escrita en `globals.css`: `--text-marca` (19 px) para el
logotipo y solo para el logotipo.

| Dónde                                    | PNG   | Puesto                |
| ---------------------------------------- | ----- | --------------------- |
| «Vinland Saga», tarjeta de ejemplo       | 22 px | `text-titulo-xs` (26) |
| Marca dentro de la maqueta de la captura | 13 px | `text-marca` (19)     |
| Marca del pie                            | 15 px | `text-marca` (19)     |

Las dos marcas caben en la excepción del logotipo (§2 admite 15–19 y el token es 19); «Vinland
Saga» no es logotipo, así que sube a 26. Las tres se ven algo mayores que en el PNG.

### 1.4 Texto gris en `#565E68`

El PNG usa `#565E68` para el párrafo del pie, el pie de la captura y «hace 4 minutos · móvil».
Ese valor es `--ash-inactivo`, que **no llega a 4.5:1 sobre ninguna superficie del sistema**
(2,81:1 sobre `--slate-900`) y solo es legítimo en controles deshabilitados y en placeholders.

**Hecho:** los tres van en `--ash-400`. `npm run lint:tokens` lo habría rechazado igualmente:
tiene una regla específica para ese token.

### 1.5 El marco dorado en tablet y móvil

El PNG solo existe a 1440 px, con el marco a 24 px. DESIGN-SPEC §3: 24 px en desktop y laptop,
**16 px en tablet**, y **se retira en móvil**. Es lo implementado (`MARCO_DORADO` en
`medidas.ts`, el mismo criterio que ya usa `(auth)/layout.tsx`).

---

## 2. Decisiones que no estaban tomadas

### 2.1 El padding lateral de esta pantalla es 80, no 40

DESIGN-SPEC §1 y §3 fijan el padding lateral **de pantalla** en 40/32/24/20. El artboard 02
dibuja la landing entera con **80 px** (`left:80px` en la nav, `padding:104px 80px 96px` en
características, `72px 80px 64px` en el pie). Manda lo específico del artboard.

Escala aplicada: **80 desktop · 64 laptop · 40 tablet · 24 móvil** (`PADDING_LATERAL`).

### 2.2 Los tres enlaces de la barra superior no tenían destino

El PNG dibuja «Características», «Sitios» y «Precios» como texto (`<span>`), no como enlaces.
Una barra de navegación que no lleva a ningún sitio no es una barra de navegación, y **no hay
rutas `/caracteristicas`, `/sitios` ni `/precios`** en el proyecto ni previstas en el encargo.

**Hecho:** son anclas a elementos que la propia landing pinta, sin inventar ni una ruta:

| Enlace          | Destino            | Por qué ese                                                                                                 |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Características | `#caracteristicas` | la banda de tres columnas, literalmente                                                                     |
| Sitios          | `#sitios`          | la característica «Retomar sin buscar», la única que habla de sitios de streaming y de sus espejos V1/V2/V3 |
| Precios         | `#precios`         | el KPI «0 € · para empezar», que es todo lo que la landing dice sobre precio                                |

Los tres destinos y su comprobación viven en `enlaces.ts` (`ANCLAS_PINTADAS`,
`anclasMuertas()`), con test de unidad y verificación por mutación. El e2e vuelve a
comprobarlo por el camino real: pulsa cada uno y exige que el destino se vea.

**Si algún día hay páginas de verdad para esos tres, se cambia el `href` en `enlaces.ts` y
ya está.**

### 2.3 Las nueve entradas del pie se quedan como texto

Producto (Biblioteca · Sitios · Importar), Recursos (Guía · API AniList · Estado) y Legal
(Privacidad · Términos · Contacto). **Ninguna de esas nueve rutas existe.** Un enlace a una
ruta inexistente es un 404 con aspecto de enlace; inventarme las rutas es lo que el encargo
prohíbe. El PNG, además, las dibuja como texto plano.

Se quedan como texto hasta que existan. Ese día se envuelven en la primitiva `Enlace` y no
hay nada más que decidir. **Es la única parte de la pantalla que se ve pulsable y no lo es**,
y merece una decisión explícita del propietario antes de publicar.

### 2.4 Las tres cifras del hero son texto de marketing, no datos

«2 480 series catalogadas · 18 sitios enlazados · 0 € para empezar» son **copia literal del
artboard**. La landing es pública: no puede consultar el vault de nadie, y la regla del
proyecto es que no se inventan datos. Quedan como están, señaladas en el código
(`KPIS` en `hero.tsx`).

**Pendiente de decisión:** o se sustituyen por cifras reales de la instalación, o se cambian
por una frase que no prometa un número. 2 480 no es un dato de este vault, que tiene 83 series.

### 2.5 «© 2026», literal

El artboard escribe 2026 y hoy es 2026. Se deja el literal en vez de `new Date().getFullYear()`
porque el diseño lo fija; si se prefiere que se actualice solo, es una línea en `pie.tsx`.

### 2.6 Jerarquía de encabezados

Un solo `<h1>` (el del hero). Los tres títulos de características son `<h2>` aunque el PNG los
rotule como H3: saltar de `h1` a `h3` deja un nivel perdido que un lector de pantalla anuncia.
El tamaño (26 px) es el del artboard y no depende del nivel.

### 2.7 Qué es ilustración y qué es contenido

- La maqueta de la biblioteca (captura enmarcada) va entera en `aria-hidden`: son huecos de
  portada vacíos —vacíos **a propósito**, DESIGN-SPEC §5— y chips inertes. Lo que sí se
  anuncia es su `<figcaption>`.
- La tarjeta de «último cambio» **no** se oculta: lleva texto que se lee, así que se anuncia
  con un `<figcaption class="sr-only">` que dice que es un ejemplo. Ocultar a un lector de
  pantalla un texto que el resto ve es peor que explicarlo.
- Los dos paneles kintsugi son `role="img"` con descripción.

### 2.8 Medidas que no están en la escala de tokens

Dos casos, y los dos anotados en el código:

- **Redondeadas al `--e-*` más cercano** las del PNG que no están en la rejilla de 8:
  26 → 24, 34 → 32, 22 → 24, 44 → 40, 14 → 12, 10 → 8, 5 → 4, 110 → 104, 100 → 96.
- **Literales en píxeles** las que DESIGN-SPEC §02 fija explícitamente y no tienen token:
  hero de `900px`, columna de texto `640px`, párrafo `520px`, panel de arte `404 × 560`,
  panel de móvil `212px`, tarjeta `260px`, columna del pie `280px`, párrafo de sincronía
  `460px`.

  **No puedo convertirlas en tokens**: eso exige tocar `globals.css`, que es de solo lectura
  para mí. Si se quiere que dejen de ser literales, el sitio es el bloque `@theme`, y entonces
  esta pantalla los usa.

### 2.9 La veta decorativa del hero se estira con `slice`

El SVG de la grieta tiene `viewBox="0 0 1440 900"`, que es exactamente el hero del artboard.
Con el ajuste por defecto quedaría con bandas al cambiar la proporción de la ventana; con
`preserveAspectRatio="xMidYMid slice"` la grieta cruza el hero entero a cualquier anchura.

---

## 3. Cosas que encontré y que NO son mías

### 3.1 `fondo-laja` / `fondo-ruido` estaban tapados por el fondo del `body`

`.fondo-laja::before` y `.fondo-ruido::after` (`src/styles/componentes.css`) son
pseudo-elementos `position: fixed` con **z-index negativo**. Un z-index negativo se pinta en el
paso 2 del contexto de apilamiento que lo contiene, y el fondo de los bloques en flujo
—incluido el `background-color: var(--slate-950)` opaco del `body`— en el paso 3. Sin un
contexto de apilamiento propio, esas dos capas caen en el del elemento raíz y **quedan
debajo del fondo del `body`**: se pagan y no se ven.

En mi pantalla lo resuelvo con `isolate` en el contenedor de la landing, y por eso las
secciones que en el artboard son `--slate-950` no declaran fondo: dejan ver el fondo global,
que es justo lo que pide DESIGN-SPEC §1.

**Lo que no es mío:** `src/app/app/page.tsx` y `src/app/dev/primitivas/page.tsx` ponen
`fondo-laja fondo-ruido` **junto a `bg-[var(--slate-950)]` en el mismo elemento**, y ahí la
textura queda tapada por el fondo del propio elemento pase lo que pase. Esas dos pantallas
no son de mi carpeta: lo dejo anotado, no lo toco.

### 3.2 `src/app/page.tsx` era el marcador de posición

Sustituido, como pedía el encargo. **No he tocado `export const dynamic = "force-dynamic"`**:
vive en el layout raíz, es un requisito del nonce de la CSP, y una landing estática se
serviría en blanco en producción.

No he creado un `page.tsx` dentro de mi carpeta: eso publicaría una ruta `/landing` duplicada
de `/`. La pantalla se exporta como componente (`landing.tsx`) y `/` la monta.

---

## 4. Donde el contrato me obligó a parar · **una parada, reportada**

### ~~`BotonEnlace`~~ — **RESUELTO EN LA INTEGRACIÓN (2026-08-24)**

> `Boton` es ahora polimórfico: con `href` renderiza un `<a>`, sin él un `<button>`, y
> con las mismas clases exactas —lo fija `src/components/ui/boton.test.tsx`, verificado
> por mutación—. `boton-enlace.tsx` está borrado y el hero usa la primitiva.
>
> **Tres diferencias visuales que introdujo esa unificación**, y no son cosméticas por
> accidente: eran deriva. El relleno dorado ya no va en negrita (la primitiva usa
> `--fw-ui-medium`); el secundario pasa de fondo transparente con hover dorado a
> `--slate-900` con hover neutro; y el CTA de nav pasa de **40 px a 44 px**, porque 40
> no está en la escala del sistema (s 32 · m 44 · l 48) y además quedaba por debajo de
> `--tactil-min`.
>
> Lo que sigue debajo es el informe original, que explica por qué hizo falta.


Los tres CTA de la landing **navegan**: «Entrar al Vault» y «Entrar» a `/login`, «Crear cuenta»
a `/registro`. Lo que navega es un `<a>`: solo un ancla se abre con el clic central, se copia
con «copiar dirección», se prefetchea y funciona con JavaScript caído. `<button>` dentro de
`<a>` es HTML inválido, y un `<button>` con `router.push` pierde las cuatro cosas y además
obliga a un `"use client"` en una pantalla que no necesita ni uno.

`components/ui/boton.tsx` renderiza **siempre** un `<button>`, no acepta `href` ni un patrón
tipo `asChild`, y sus mapas de clases (`BASE`, `TAMANOS`, `VARIANTES`) son privados del módulo.
No es editable desde mi encargo.

**Qué hice:** `boton-enlace.tsx`, en mi carpeta. Se compone sobre la primitiva `Enlace` —así
la guarda del `href` (nada que no sea http(s) o ruta propia) y la decisión `next/link` vs `<a>`
siguen siendo las del sistema— y reconstruye la apariencia con **los mismos tokens y la misma
fila de DESIGN-SPEC §6** que el `Boton`. No hay ni un valor nuevo: mismos colores, mismo radio,
mismo tracking, mismo anillo de foco, misma área táctil mínima.

**Lo que hace falta para que esto desaparezca:** que `boton.tsx` exporte sus mapas de clases,
o que acepte renderizarse como ancla. Ese día se borra este fichero. **No lo he hecho yo
porque `src/components/**` es de solo lectura para este encargo.**

---

## 5. Las reglas del oro, revisadas a mano

1. **≤ 10 % de oro.** El oro de la pantalla es: el hexágono del logotipo (×2), el borde del
   botón «Entrar», el relleno del único botón sólido, las tres cifras del hero, la veta del
   hero, cuatro hairlines de marco `--gold-700`, tres iconos de 34 px, las etiquetas
   UPPERCASE en `--gold-300` y cinco barras de progreso de 1 px. Entornando los ojos se ve
   piedra, no oro.
2. **Nunca oro sobre oro.** Un caso que merece la vista del verificador: dentro de la captura
   enmarcada, el chip «Viendo» lleva borde `--gold-borde` y está —a dos niveles— dentro del
   marco `--gold-700`. Entre los dos hay una card con borde `--slate-800`, así que no es
   «borde dorado dentro de una card con borde dorado». Es lo que dibuja el PNG.
3. **Un solo botón de relleno dorado sólido: «Entrar al Vault».** No es una promesa: los tres
   CTA se declaran juntos en `enlaces.ts` y `enlaces.test.ts` cuenta los sólidos. Verificado
   por mutación (poner un segundo `solido` pone el test en rojo).
4. **Nada de texto dorado por debajo de 12 px.** El más pequeño es `--gold-300` a 11 px en las
   etiquetas UPPERCASE, y va sobre fondo oscuro, que es lo que la regla acota.

---

## 6. Verificación

Ejecutado y leído (salida literal en el informe):

```
npx tsc --noEmit            exit 0
npm run lint                exit 0
npm run lint:tokens         exit 0   (139 ficheros, ningún color literal)
npx vitest run src/app/(publico)/landing/enlaces.test.ts   exit 0   (10 tests)
```

**No ejecutado, y a propósito:** `npm run build`, `npm run dev` y `npx playwright test`.
Hay más agentes trabajando sobre el mismo `.next` y dos compilaciones a la vez lo corrompen.
`e2e/landing.spec.ts` está escrito y **sin ejecutar**: lo corre la integración.

### Lo que el recorrido en navegador cubre, y el hueco que tenía

La landing **no tiene formulario ni campo opcional**: son cinco secciones de texto y siete
enlaces. El caso que exige `testing.md` —«dejarlo todo en blanco y enviar», el que costó un
bug que sobrevivió a 499 tests— no tiene dónde aplicarse aquí, así que **se recorre por el
camino que la propia landing abre**: se pulsa «Entrar al Vault», se envía el formulario de
login vacío y se comprueba que no se entra y que la pantalla sigue viva. Del texto exacto del
aviso no se afirma nada: esa pantalla es de otro agente.

El resto del recorrido: que se pinta con la CSP puesta y **sin `bypassCSP`**, que la consola no
reporta un solo bloqueo, que los siete enlaces llevan a donde dicen (incluidas las tres
anclas), que volver atrás deja la pantalla usable —volviendo a pulsar, no solo mirando—, que
recargar a mitad no la rompe, y que a 390 px no desborda a lo ancho.
