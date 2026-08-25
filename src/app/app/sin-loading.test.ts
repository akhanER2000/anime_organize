import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NINGUNA FRONTERA DE SUSPENSE SOBRE `/app`. NI DE RUTA, NI INTERNA.
 *
 * ── SI ESTÁS LEYENDO ESTO PORQUE EL TEST SE HA PUESTO ROJO ────────────────
 *
 * No es una regla de estilo y no la borres. Un `loading.tsx` aquí rompe DOS
 * cosas a la vez, y ninguna de las dos se parece a «falta el esqueleto»:
 *
 *   1. un anime que no existe pasa a responder **200 en vez de 404**, y con eso
 *      se puede enumerar el vault de otra persona;
 *   2. **los chips de filtro dejan de navegar**, sin error y sin petición.
 *
 * Las dos tardaron horas en diagnosticarse porque el fichero que las causa no
 * está en la carpeta donde se ven los síntomas. Lo que sigue es lo que se midió,
 * para que no haya que volver a medirlo.
 *
 * ── 1. EL 404 QUE RESPONDÍA 200 ───────────────────────────────────────────
 *
 * `loading.tsx` es un `<Suspense>`, y un `<Suspense>` autoriza a Next a vaciar
 * la cabecera de la respuesta con **200** y mandar el esqueleto mientras la
 * página sigue resolviéndose. Cuando `notFound()` se lanza, las cabeceras ya
 * viajaron: el 404 llega como contenido dentro de un 200.
 *
 * Se acotó una variable por build, contra `next start` y con cookie real:
 *
 *   | configuración                                          | estado |
 *   |--------------------------------------------------------|--------|
 *   | `notFound()` en una página suelta de `(publico)`        |  404   |
 *   | la misma bajo `/app`, con `src/app/app/loading.tsx`     | **200**|
 *   | la misma, quitando ese `loading.tsx`                    |  404   |
 *   | la ficha con su propio `[id]/loading.tsx`               | **200**|
 *   | lanzando el `notFound()` desde `generateMetadata`       | **200**|
 *
 * Se descartaron midiendo, no razonando: NO era el middleware (falla igual
 * desactivándolo), NO era el layout de `/app` (falla igual vaciándolo) y NO era
 * el `not-found.tsx` del segmento (falla igual sin él).
 *
 * `security.md` §1 responde 404 y nunca 403 precisamente para que no se
 * distinga «no existe» de «no es tuyo». Con 200 en los dos casos, quien enumera
 * el vault ajeno **no necesita ni leer el cuerpo de la respuesta**.
 *
 * ── 2. LOS FILTROS QUE NO NAVEGABAN ───────────────────────────────────────
 *
 * En una ruta cubierta por `loading.tsx`, `router.push()` **al mismo pathname
 * con distinta query** actualiza el árbol de React —`useSearchParams()` devuelve
 * el valor nuevo— y **nunca sincroniza la URL del navegador**. A los 3 segundos
 * seguía sin moverse: no es lentitud, es que no ocurre. Ni petición, ni error,
 * ni nada. El chip parecía muerto.
 *
 * Un 2×2 sobre la pantalla real descartó las dos explicaciones fáciles:
 *
 *   |            | caja `inline` (19 px) | caja `inline-flex` (32 px) |
 *   |------------|-----------------------|----------------------------|
 *   | `<Link>`   | no navega             | **no navega**              |
 *   | `<a>`      | navega                | navega                     |
 *
 * O sea que no era la geometría. Y `router.push()` a pelo fallaba igual, o sea
 * que tampoco era `<Link>`. Era la frontera.
 *
 * El apaño mientras tanto fueron `<a>` normales en los chips, en las cabeceras
 * de orden y en la salida del filtro vacío: **tres recargas completas de página
 * con 83 portadas** en los tres controles que más se usan.
 *
 * ── 3. Y UN `<Suspense>` INTERNO TAMPOCO VALE ─────────────────────────────
 *
 * La hipótesis razonable era que una frontera de RUTA y un límite INTERNO son
 * cosas distintas, y la primera medición la respaldaba: con el `<Suspense>`
 * dentro de la página envolviendo solo la rejilla, `router.push` sincronizaba
 * la URL y el esqueleto llegaba antes que las filas.
 *
 * Pero esa medición probaba UN clic. Con DOS clics seguidos, 3 s entre medias:
 *
 *   | configuración               | 1er clic          | 2º clic                        |
 *   |-----------------------------|-------------------|--------------------------------|
 *   | CON `<Suspense>` interno    | `?estado=VIENDO`  | **`?estado=VIENDO`** (no entra) |
 *   | SIN `<Suspense>` interno    | `?estado=VIENDO`  | `?estado=VIENDO&estado=VISTO`  |
 *
 * 3/3 en las dos. El límite interno reproduce el mismo fallo, solo que no en la
 * primera navegación — que es un fallo **más caro**, porque parece que funciona.
 * Filtrar por dos estados seguidos es un gesto normal.
 *
 * ── LO QUE ESTO CUESTA, DICHO SIN ADORNOS ─────────────────────────────────
 *
 * `/app` y `/app/lista` **no tienen esqueleto de carga**. Es el precio, y está
 * pagado a sabiendas después de intentar recuperarlo dos veces.
 *
 * El esqueleto que pide `DESIGN-SPEC` §262 es un **estado de componente** —card,
 * fila, input— y ese sí se puede tener: vive dentro del componente, no en una
 * frontera de ruta. Es el camino por explorar si algún día molesta.
 *
 * ── LO QUE NO ESTÁ CARACTERIZADO ──────────────────────────────────────────
 *
 * Una página de sonda TRIVIAL bajo `/app`, con un `loading.tsx` de una línea,
 * **no reproducía** el fallo. O sea que hace falta algo más que la mera
 * presencia del fichero —probablemente que el render del servidor tarde lo
 * suficiente—, y no se ha acotado el umbral.
 *
 * Por eso esta regla es CATEGÓRICA en vez de condicional: no sabemos dónde está
 * la frontera, así que no se cruza. Una regla que dijera «solo si la página es
 * lenta» obligaría a medir en cada cambio, y el fallo no avisa.
 *
 * ── DÓNDE ESTÁ MEDIDO CADA COSA ───────────────────────────────────────────
 *
 *   · el código de estado    → `e2e/ficha-anime.spec.ts` § «uuid que NO EXISTE»
 *   · el primer clic         → `e2e/biblioteca.spec.ts` § «FILTRAR NO RECARGA»
 *   · el segundo clic        → `e2e/biblioteca.spec.ts` § «DOS CLICS SEGUIDOS»
 *   · el porqué de las dos consultas → `src/app/app/(biblioteca)/page.tsx`
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   Se repuso `(biblioteca)/loading.tsx` → este test en rojo, la ficha volvió a
 *   responder 200 y los chips dejaron de navegar. Restaurado → verde.
 *
 * CAMINO REAL (2026-08-24): las tres consecuencias se midieron contra
 *   `next start`, con cookie de sesión real: el código de estado con `fetch`, y
 *   las navegaciones con Chromium contando peticiones de documento. Este test
 *   de disco NO mide ninguna: fija la causa para que no haya que rediagnosticar.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("el subárbol del vault no puede tener fronteras de carga de ruta", () => {
  /** Todos los `loading.tsx` bajo una carpeta, recursivamente. */
  function loadingsEn(raiz: string, relativo = ""): string[] {
    const encontrados: string[] = [];
    for (const entrada of readdirSync(raiz)) {
      const completa = join(raiz, entrada);
      if (statSync(completa).isDirectory()) {
        encontrados.push(...loadingsEn(completa, join(relativo, entrada)));
      } else if (entrada === "loading.tsx") {
        encontrados.push(join(relativo, entrada));
      }
    }
    return encontrados;
  }

  it("no hay ningún loading.tsx bajo src/app/app/", () => {
    const encontrados = loadingsEn(join(process.cwd(), "src", "app", "app"));

    expect(
      encontrados,
      "Un loading.tsx aquí rompe DOS cosas a la vez, y ninguna se parece a «falta " +
        "el esqueleto»: (1) un anime inexistente pasa a responder 200 en vez de 404, " +
        "y con eso se enumera el vault ajeno; (2) los chips de filtro dejan de " +
        "navegar, sin error y sin petición. Un <Suspense> INTERNO tampoco vale: ahí " +
        "el primer clic funciona y falla el segundo, que es peor porque parece que " +
        "va. Las tres mediciones están en la cabecera de este fichero. Si necesitas " +
        "un esqueleto, hazlo estado de componente (dentro de la card o de la fila), " +
        "no frontera de ruta.",
    ).toEqual([]);
  });

  it("y el layout raíz tampoco tiene uno que cubra /app", () => {
    // Control positivo: si el test solo mirase dentro de src/app/app, un
    // loading.tsx en src/app/ cubriría igual todo el subárbol y este fichero
    // seguiría en verde. Fue exactamente así como llegó el primero.
    const enRaiz = readdirSync(join(process.cwd(), "src", "app")).includes("loading.tsx");

    expect(enRaiz, "src/app/loading.tsx cubriría /app entero").toBe(false);
  });

  it("tampoco un <Suspense> alrededor de la rejilla o de la tabla", () => {
    // ── POR QUÉ ESTO MIRA EL TEXTO DEL FICHERO ─────────────────────────
    //
    // El de arriba mira nombres de fichero y no puede ver un `<Suspense>`
    // escrito dentro de una página. Y ese es justo el que se intentó y hubo que
    // deshacer: el que rompe el SEGUNDO clic.
    //
    // Se busca por el componente que envuelve, no por la palabra `Suspense` a
    // secas: `BarraFiltros` SÍ necesita el suyo —lee `useSearchParams()` y Next
    // exige una frontera alrededor de cualquier cliente que lo haga—, así que
    // prohibirlo entero sería prohibir la pantalla.
    const paginas = [
      join("src", "app", "app", "(biblioteca)", "page.tsx"),
      join("src", "app", "app", "lista", "page.tsx"),
    ];

    for (const relativa of paginas) {
      const texto = readFileSync(join(process.cwd(), relativa), "utf-8");

      for (const envuelto of ["ContenidoRejilla", "Rejilla", "TablaLista", "Contador"]) {
        const patron = new RegExp(`<Suspense[^>]*>[\\s\\S]{0,400}?<${envuelto}\\b`);

        expect(
          patron.test(texto),
          `${relativa} envuelve <${envuelto}> en un <Suspense>. El primer clic de un ` +
            "chip funcionará y el segundo no. Medido 3/3: ver la cabecera de este fichero.",
        ).toBe(false);
      }
    }
  });
});
