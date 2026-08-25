import { describe, expect, it } from "vitest";

import {
  EsquemaCrearAnime,
  EsquemaEstado,
  EsquemaEtiquetaProgreso,
  EsquemaFavorito,
  EsquemaNotas,
  EsquemaTitulo,
  EsquemaUrlPortada,
} from "./anime";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ALTA DE UN ANIME — artboard 06.
 *
 * ── LO QUE DE VERDAD PROTEGE ESTE FICHERO ─────────────────────────────────
 *
 * `EsquemaCrearAnime` se usa **a los dos lados de la red**: el modal valida con
 * él por UX y la Server Action revalida con él por seguridad. Y transforma. Un
 * esquema compartido que transforma **tiene que aceptar su propia salida**, o
 * el segundo parseo rechaza lo que produjo el primero.
 *
 * Es exactamente el fallo que llegó a producción con `EsquemaNombre`: convertía
 * `""` en `null` en el cliente y el servidor rechazaba `null` con «expected
 * string, received null». **Todo registro que dejara el nombre en blanco
 * fallaba** — el caso normal de un campo opcional, el que hace la mayoría de la
 * gente. No lo vieron el typecheck, el lint, 499 tests, la auditoría de
 * seguridad ni el verificador de fidelidad. Lo vio un navegador al primer
 * intento, porque es la única prueba que recorre el viaje entero.
 *
 * Aquí eso se fija a nivel de unidad con el viaje de ida y vuelta:
 *
 *     parse(entrada) ─▶ salida ─▶ parse(salida) tiene que valer LO MISMO
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   Se cambió `.nullish()` por `.optional()` en `EsquemaUrlPortada`,
 *   `EsquemaNotas` y `EsquemaEtiquetaProgreso` — que es literalmente el bug de
 *   `EsquemaNombre` reintroducido — y se pusieron en ROJO **19 tests**, todos
 *   con «el servidor rechaza lo que produjo el cliente». Restaurado y en verde.
 *
 *   NO basta con el primer parseo: con `.optional()` la ida sigue pasando. Un
 *   test que solo comprobara `parse("") === null` habría seguido verde mientras
 *   la aplicación estaba rota.
 *
 *   Un detalle que la mutación enseñó y conviene dejar escrito: como estos
 *   esquemas SÍ llevan mensaje propio, el fallo no se ve como el «expected
 *   string, received null» de Zod, sino como «Pega la dirección de una imagen»
 *   sobre un campo que el usuario dejó en blanco a propósito. Es decir: un
 *   mensaje en español, perfectamente redactado y **mintiendo**. Que el mensaje
 *   esté cuidado no salva del fallo; solo lo disfraza mejor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Mensajes legibles cuando un `safeParse` falla, para que el fallo se explique. */
function motivos(resultado: {
  success: false;
  error: { issues: readonly { path: PropertyKey[]; message: string }[] };
}): string {
  return resultado.error.issues
    .map((incidencia) => `${incidencia.path.join(".") || "(raíz)"}: ${incidencia.message}`)
    .join(" | ");
}

// ---------------------------------------------------------------------------
// 1. EL VIAJE DE IDA Y VUELTA — campo a campo
// ---------------------------------------------------------------------------

describe("IDA Y VUELTA: cada campo que transforma acepta su propia salida", () => {
  const CASOS = [
    // Los tres opcionales que convierten «no lo rellené» en `null`. Las cuatro
    // formas de dejarlo en blanco tienen que cerrar el viaje, y la cuarta
    // —`null`— es justamente la que produce la primera pasada.
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: undefined },
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: null },
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: "" },
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: "   " },
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: "https://s4.anilist.co/x.jpg" },
    { campo: "urlPortada", esquema: EsquemaUrlPortada, entrada: "  https://s4.anilist.co/x.jpg  " },

    { campo: "notas", esquema: EsquemaNotas, entrada: undefined },
    { campo: "notas", esquema: EsquemaNotas, entrada: null },
    { campo: "notas", esquema: EsquemaNotas, entrada: "" },
    { campo: "notas", esquema: EsquemaNotas, entrada: "   " },
    { campo: "notas", esquema: EsquemaNotas, entrada: "  Me la recomendó Rocío  " },

    { campo: "etiquetaProgreso", esquema: EsquemaEtiquetaProgreso, entrada: undefined },
    { campo: "etiquetaProgreso", esquema: EsquemaEtiquetaProgreso, entrada: null },
    { campo: "etiquetaProgreso", esquema: EsquemaEtiquetaProgreso, entrada: "" },
    { campo: "etiquetaProgreso", esquema: EsquemaEtiquetaProgreso, entrada: "   " },
    { campo: "etiquetaProgreso", esquema: EsquemaEtiquetaProgreso, entrada: "Solo 1ra Temporada" },

    // Los que rellenan un valor por defecto: la salida ya no es `undefined`, y
    // tiene que volver a entrar igual.
    { campo: "estado", esquema: EsquemaEstado, entrada: undefined },
    { campo: "estado", esquema: EsquemaEstado, entrada: "VIENDO" },
    { campo: "esFavorito", esquema: EsquemaFavorito, entrada: undefined },
    { campo: "esFavorito", esquema: EsquemaFavorito, entrada: true },

    // Y el que recorta.
    { campo: "titulo", esquema: EsquemaTitulo, entrada: "  Mushishi  " },
  ] as const;

  it.each(CASOS)("$campo ← $entrada", ({ esquema, entrada }) => {
    // Primer parseo: el del CLIENTE.
    const ida = esquema.safeParse(entrada);
    expect(ida.success, ida.success ? "" : `rechaza una entrada legítima: ${motivos(ida)}`).toBe(
      true,
    );
    if (!ida.success) return;

    // Segundo parseo: el del SERVIDOR, sobre lo que el cliente le mandó.
    const vuelta = esquema.safeParse(ida.data);
    expect(
      vuelta.success,
      vuelta.success ? "" : `el servidor rechaza lo que produjo el cliente: ${motivos(vuelta)}`,
    ).toBe(true);
    if (!vuelta.success) return;

    // Y es IDEMPOTENTE: si no lo fuera, el valor cambiaría en cada salto de red.
    expect(vuelta.data).toEqual(ida.data);
  });
});

describe("IDA Y VUELTA: el objeto entero del modal", () => {
  const CASOS = [
    {
      nombre: "solo el título — TODO LO OPCIONAL EN BLANCO (el caso que más gente hace)",
      entrada: { titulo: "Mushishi" },
    },
    {
      nombre: "los opcionales como cadena vacía — EL CASO QUE FALLÓ EN PRODUCCIÓN",
      entrada: { titulo: "Mushishi", urlPortada: "", notas: "", etiquetaProgreso: "" },
    },
    {
      nombre: "los opcionales con solo espacios",
      entrada: { titulo: "Mushishi", urlPortada: "  ", notas: "   ", etiquetaProgreso: " " },
    },
    {
      nombre: "los opcionales como null — lo que devuelve la PRIMERA pasada",
      entrada: {
        titulo: "Mushishi",
        estado: "PENDIENTE",
        urlPortada: null,
        esFavorito: false,
        notas: null,
        etiquetaProgreso: null,
      },
    },
    {
      nombre: "la ficha completa",
      entrada: {
        titulo: "Sousou no Frieren",
        estado: "VIENDO",
        urlPortada: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/frieren.jpg",
        esFavorito: true,
        notas: "Empezada con Rocío el 12 de marzo.",
        etiquetaProgreso: "Temporada 1 · episodio 14",
      },
    },
    {
      nombre: "todo con espacios alrededor",
      entrada: {
        titulo: "  Vinland Saga  ",
        estado: "VISTO",
        urlPortada: "  https://ejemplo.test/portada.webp  ",
        esFavorito: true,
        notas: "  Segunda temporada mejor que la primera.  ",
        etiquetaProgreso: "  Completo (Todo Visto)  ",
      },
    },
  ] as const;

  it.each(CASOS)("$nombre", ({ entrada }) => {
    const ida = EsquemaCrearAnime.safeParse(entrada);
    expect(ida.success, ida.success ? "" : `rechaza un alta legítima: ${motivos(ida)}`).toBe(true);
    if (!ida.success) return;

    const vuelta = EsquemaCrearAnime.safeParse(ida.data);
    expect(
      vuelta.success,
      vuelta.success ? "" : `el servidor rechaza lo que produjo el cliente: ${motivos(vuelta)}`,
    ).toBe(true);
    if (!vuelta.success) return;

    expect(vuelta.data).toEqual(ida.data);
  });

  it("dejar en blanco todo lo opcional produce el alta mínima completa", () => {
    // Es el contrato que consume la Server Action: sin `undefined` sueltos y con
    // los defectos ya aplicados, para que no tenga que volver a decidirlos.
    const resultado = EsquemaCrearAnime.parse({ titulo: "Mushishi" });

    expect(resultado).toEqual({
      titulo: "Mushishi",
      estado: "PENDIENTE",
      urlPortada: null,
      esFavorito: false,
      notas: null,
      etiquetaProgreso: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 2. TÍTULO
// ---------------------------------------------------------------------------

describe("titulo", () => {
  it("recorta los espacios de alrededor", () => {
    expect(EsquemaTitulo.parse("  Mushishi  ")).toBe("Mushishi");
  });

  it("rechaza la cadena vacía", () => {
    expect(EsquemaTitulo.safeParse("").success).toBe(false);
  });

  it("rechaza un título de solo espacios", () => {
    // Se recorta ANTES de comprobar el mínimo: si el orden se invirtiera, "   "
    // pasaría el `min(1)` y entraría en la base un título en blanco.
    expect(EsquemaTitulo.safeParse("     ").success).toBe(false);
  });

  it("falta la clave: se rechaza igual que si viniera vacía", () => {
    expect(EsquemaCrearAnime.safeParse({}).success).toBe(false);
  });

  it("acepta el título más largo de los 83 reales del vault", () => {
    // Regresión contra un tope elegido a ojo: este título existe en el seed.
    const real = "Keikenzumi na Kimi to, Keiken Zero na Ore ga, Otsukiai suru Hanashi.";

    expect(EsquemaTitulo.parse(real)).toBe(real);
  });

  it("no normaliza: conserva mayúsculas, acentos y puntuación tal cual", () => {
    // `title_normalized` es OTRA columna y la calcula el servidor. Si este
    // esquema normalizara, el vault mostraría el título en minúsculas y sin
    // acentos (skill de dominio §1).
    expect(EsquemaTitulo.parse("Kimi nó Ná wa")).toBe("Kimi nó Ná wa");
    expect(EsquemaTitulo.parse("Fate/Zero")).toBe("Fate/Zero");
  });

  it("rechaza un título absurdamente largo", () => {
    expect(EsquemaTitulo.safeParse("x".repeat(201)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. URL DE PORTADA
// ---------------------------------------------------------------------------

describe("urlPortada", () => {
  it("ausente, vacía, en blanco y nula son todas `null`", () => {
    // Las cuatro formas de «no puse imagen» tienen que dar lo mismo: si no, la
    // base guardaría `""` unas veces y `null` otras.
    for (const valor of [undefined, null, "", "   "]) {
      expect(EsquemaUrlPortada.parse(valor)).toBeNull();
    }
  });

  it("acepta http y https", () => {
    expect(EsquemaUrlPortada.parse("https://s4.anilist.co/x.jpg")).toBe(
      "https://s4.anilist.co/x.jpg",
    );
    expect(EsquemaUrlPortada.parse("http://ejemplo.test/x.png")).toBe("http://ejemplo.test/x.png");
  });

  const ESQUEMAS_RECHAZADOS = [
    // XSS almacenado: se guarda una vez y dispara cada vez que alguien abre la
    // ficha (`security.md` §8).
    "javascript:alert(1)",
    // Con espacios delante y con un tabulador en medio: los dos esquivan un
    // `startsWith` y el navegador los ejecuta igual. Por eso se decide con el
    // parser de URL y no comparando cadenas.
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "JavaScript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://ejemplo.test/x.jpg",
    // Relativa: es un `href` seguro pero no una dirección que se pueda
    // descargar. Por eso este esquema NO reutiliza `esHrefSeguro`.
    "/portada.jpg",
    "ejemplo.test/x.jpg",
    "no es una url",
  ] as const;

  it.each(ESQUEMAS_RECHAZADOS)("rechaza %s", (valor) => {
    expect(EsquemaUrlPortada.safeParse(valor).success).toBe(false);
  });

  it("rechaza una dirección desmesurada", () => {
    expect(EsquemaUrlPortada.safeParse(`https://ejemplo.test/${"x".repeat(2048)}`).success).toBe(
      false,
    );
  });

  it("una URL privada SÍ pasa el esquema: la para el pipeline, no la validación", () => {
    // Este test documenta un LÍMITE a propósito, para que nadie lea el esquema
    // como si fuera la defensa contra SSRF. `https://127.0.0.1/x.png` es una URL
    // https perfectamente formada: quien tiene que rechazarla es la descarga,
    // resolviendo el host y bloqueando los rangos privados (`security.md` §4).
    expect(EsquemaUrlPortada.parse("https://127.0.0.1/x.png")).toBe("https://127.0.0.1/x.png");
  });
});

// ---------------------------------------------------------------------------
// 4. ESTADO
// ---------------------------------------------------------------------------

describe("estado", () => {
  it("por defecto es PENDIENTE", () => {
    expect(EsquemaEstado.parse(undefined)).toBe("PENDIENTE");
    expect(EsquemaCrearAnime.parse({ titulo: "Mushishi" }).estado).toBe("PENDIENTE");
  });

  it.each(["VISTO", "VIENDO", "EN_ESPERA", "ABANDONADO", "PENDIENTE"])("acepta %s", (estado) => {
    expect(EsquemaEstado.parse(estado)).toBe(estado);
  });

  const NO_EXISTEN = [
    "TERMINADO",
    "Visto",
    "visto",
    "EN ESPERA",
    "",
    "VISTO; DROP TABLE anime",
  ] as const;

  it.each(NO_EXISTEN)("rechaza el estado inexistente %s", (estado) => {
    // La lista sale de `ESTADOS` y es la misma que el `CHECK` de la base. Si
    // aquí entrara un valor de más, la base lo rechazaría con un 500 aleatorio.
    expect(EsquemaEstado.safeParse(estado).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. FAVORITO, NOTAS Y ETIQUETA DE PROGRESO
// ---------------------------------------------------------------------------

describe("esFavorito", () => {
  it("por defecto es false", () => {
    expect(EsquemaFavorito.parse(undefined)).toBe(false);
  });

  it("acepta true y false", () => {
    expect(EsquemaFavorito.parse(true)).toBe(true);
    expect(EsquemaFavorito.parse(false)).toBe(false);
  });

  it("no acepta la cadena de una casilla sin convertir", () => {
    // `anime.is_favorite` es `NOT NULL`: un `"on"` colado se guardaría como
    // verdadero por ser una cadena no vacía. Quien serialice el formulario
    // convierte antes.
    expect(EsquemaFavorito.safeParse("on").success).toBe(false);
  });
});

describe("notas", () => {
  it("ausente, vacía, en blanco y nula son todas `null`", () => {
    for (const valor of [undefined, null, "", "   "]) {
      expect(EsquemaNotas.parse(valor)).toBeNull();
    }
  });

  it("recorta y conserva el texto", () => {
    expect(EsquemaNotas.parse("  Me la recomendó Rocío  ")).toBe("Me la recomendó Rocío");
  });

  it("rechaza unas notas desmesuradas", () => {
    expect(EsquemaNotas.safeParse("x".repeat(4001)).success).toBe(false);
  });
});

describe("etiquetaProgreso", () => {
  it("ausente, vacía, en blanco y nula son todas `null`", () => {
    for (const valor of [undefined, null, "", "   "]) {
      expect(EsquemaEtiquetaProgreso.parse(valor)).toBeNull();
    }
  });

  it.each(["Completo (Todo Visto)", "Solo 1ra Temporada", "En Proceso"])(
    "conserva tal cual la etiqueta real del seed: %s",
    (etiqueta) => {
      // Se guarda LO QUE ESCRIBIÓ EL USUARIO, no una versión reescrita por
      // nosotros (skill de dominio §4).
      expect(EsquemaEtiquetaProgreso.parse(etiqueta)).toBe(etiqueta);
    },
  );

  it("rechaza una etiqueta desmesurada", () => {
    expect(EsquemaEtiquetaProgreso.safeParse("x".repeat(81)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. BASURA EXTRA
// ---------------------------------------------------------------------------

describe("basura extra en el objeto", () => {
  it("las claves que no conoce se descartan sin romper el parseo", () => {
    const resultado = EsquemaCrearAnime.safeParse({
      titulo: "Mushishi",
      utm_source: "newsletter",
      userId: "11111111-1111-1111-1111-111111111111",
      id: "otro-anime",
      isFavorite: true,
      "": "",
      42: "cuarenta y dos",
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;

    expect(resultado.data).toEqual({
      titulo: "Mushishi",
      estado: "PENDIENTE",
      urlPortada: null,
      esFavorito: false,
      notas: null,
      etiquetaProgreso: null,
    });
  });

  it("un `userId` que venga del cliente NO sobrevive al parseo", () => {
    // El `userId` sale SIEMPRE de `auth()` en el servidor, nunca del cliente
    // (`security.md` §1). Que el esquema lo descarte es la primera barrera: lo
    // que no está en la salida no se puede pasar por descuido al `insert`.
    const datos = EsquemaCrearAnime.parse({
      titulo: "Mushishi",
      userId: "22222222-2222-2222-2222-222222222222",
    });

    expect(Object.keys(datos).sort()).toEqual([
      "esFavorito",
      "estado",
      "etiquetaProgreso",
      "notas",
      "titulo",
      "urlPortada",
    ]);
  });

  it("no rompe con entradas que no son un objeto", () => {
    for (const basura of [null, undefined, 42, "Mushishi", [], true]) {
      expect(EsquemaCrearAnime.safeParse(basura).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. LOS MENSAJES SE LE ENSEÑAN AL USUARIO TAL CUAL
// ---------------------------------------------------------------------------

/**
 * `api-conventions.md` § «Forma de la respuesta»: el mensaje va **en español** y
 * es apto para enseñárselo al usuario tal cual.
 *
 * Si alguien añade un campo y se le olvida el mensaje, Zod pone el suyo en
 * inglés —«Invalid input: expected string, received null»— y el formulario se
 * lo enseña al usuario. Estos casos recorren TODOS los campos por sus dos vías
 * de fallo (tipo y regla) para que ese descuido salga en rojo.
 */
describe("los mensajes de error están en español y son mostrables", () => {
  const ENTRADAS_INVALIDAS = [
    { que: "sin título", valor: {} },
    { que: "título vacío", valor: { titulo: "" } },
    { que: "título en blanco", valor: { titulo: "   " } },
    { que: "título que no es texto", valor: { titulo: 42 } },
    { que: "título larguísimo", valor: { titulo: "x".repeat(201) } },
    { que: "estado inexistente", valor: { titulo: "M", estado: "TERMINADO" } },
    { que: "estado que no es texto", valor: { titulo: "M", estado: 7 } },
    { que: "url con javascript:", valor: { titulo: "M", urlPortada: "javascript:alert(1)" } },
    { que: "url que no es texto", valor: { titulo: "M", urlPortada: 42 } },
    {
      que: "url larguísima",
      valor: { titulo: "M", urlPortada: `https://e.test/${"x".repeat(2048)}` },
    },
    { que: "favorito que no es booleano", valor: { titulo: "M", esFavorito: "sí" } },
    { que: "notas que no son texto", valor: { titulo: "M", notas: 42 } },
    { que: "notas larguísimas", valor: { titulo: "M", notas: "x".repeat(4001) } },
    { que: "etiqueta que no es texto", valor: { titulo: "M", etiquetaProgreso: 42 } },
    { que: "etiqueta larguísima", valor: { titulo: "M", etiquetaProgreso: "x".repeat(81) } },
  ] as const;

  /** Lo que delata a un mensaje por defecto de Zod, que está en inglés. */
  const HUELLA_DE_ZOD = /invalid|expected|received|required|must contain|too big|too small/i;

  it.each(ENTRADAS_INVALIDAS)("$que", ({ valor }) => {
    const resultado = EsquemaCrearAnime.safeParse(valor);

    expect(resultado.success, "esta entrada tenía que ser rechazada").toBe(false);
    if (resultado.success) return;

    for (const incidencia of resultado.error.issues) {
      expect(
        HUELLA_DE_ZOD.test(incidencia.message),
        `mensaje por defecto de Zod, en inglés, camino del formulario: «${incidencia.message}»`,
      ).toBe(false);
      // Un mensaje vacío se pinta como un hueco rojo sin explicación.
      expect(incidencia.message.trim().length).toBeGreaterThan(0);
    }
  });

  it("el mensaje del título ausente dice qué hacer, no qué falló", () => {
    const resultado = EsquemaCrearAnime.safeParse({});

    expect(resultado.success).toBe(false);
    if (resultado.success) return;

    expect(resultado.error.issues[0]?.message).toBe("Escribe el título del anime");
  });
});
