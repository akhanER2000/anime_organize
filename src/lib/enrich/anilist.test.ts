import { describe, expect, it } from "vitest";

import { aTextoPlano, mapearMedia, EsquemaRespuestaAniList } from "./anilist";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANILIST — PASO 1 DEL ENRIQUECIMIENTO.
 *
 * Aquí no se llama a la red: se prueba **lo que se hace con lo que llega**, que
 * es donde están los dos riesgos.
 *
 * 1. **La sinopsis viene con HTML.** `security.md` §9: «las descripciones de
 *    AniList llegan con HTML: se sanitizan a texto plano EN EL SERVIDOR». Si se
 *    guardara el HTML y alguien lo pintara con `dangerouslySetInnerHTML` un día,
 *    sería XSS almacenado de una fuente de terceros.
 * 2. **El mapeo puede mentir en silencio.** Un `format` que no es de los
 *    nuestros, una puntuación en otra escala o un año que no viene: cada uno
 *    escribe un dato falso en el vault del dueño sin fallar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe("aTextoPlano", () => {
  it("quita las etiquetas que AniList mete de verdad", () => {
    const bruto = "Una chica <i>normal</i> conoce a un <b>chico</b>.<br><br>Y todo cambia.";

    expect(aTextoPlano(bruto)).toBe("Una chica normal conoce a un chico.\n\nY todo cambia.");
  });

  it("un <script> NO deja su contenido suelto en la sinopsis", () => {
    // Quitar sólo las marcas dejaría el cuerpo del script como texto de la
    // sinopsis. Es inofensivo como texto, pero es basura visible y significa
    // que el saneador no entiende lo que está haciendo.
    const bruto = "Sinopsis.<script>alert('hola')</script> Fin.";

    expect(aTextoPlano(bruto)).toBe("Sinopsis. Fin.");
  });

  it("decodifica las entidades, incluidas las numéricas", () => {
    expect(aTextoPlano("Tom &amp; Jerry &lt;3 &quot;algo&quot; &#39;otro&#39; &#x41;")).toBe(
      `Tom & Jerry <3 "algo" 'otro' A`,
    );
  });

  it("no deja que una entidad reconstruya una etiqueta al decodificar", () => {
    // El orden importa: si se decodifica ANTES de quitar etiquetas,
    // `&lt;script&gt;` se convierte en `<script>` y sale intacto.
    const bruto = "&lt;script&gt;alert(1)&lt;/script&gt;";

    // Se decodifica DESPUÉS, así que queda como texto literal e inerte.
    expect(aTextoPlano(bruto)).toBe("<script>alert(1)</script>");
  });

  it("colapsa el espacio sobrante pero conserva los párrafos", () => {
    expect(aTextoPlano("Uno   dos.<br><br><br><br>Tres.")).toBe("Uno dos.\n\nTres.");
  });

  it("una sinopsis ausente es `null`, no una cadena vacía", () => {
    expect(aTextoPlano(null)).toBeNull();
    expect(aTextoPlano("   ")).toBeNull();
    expect(aTextoPlano("<br><br>")).toBeNull();
  });
});

describe("EsquemaRespuestaAniList", () => {
  it("acepta la forma real de una respuesta con resultado", () => {
    const bruto = {
      data: {
        Media: {
          id: 1535,
          title: { romaji: "Death Note", english: "Death Note", native: "デスノート" },
          synonyms: ["DN"],
          description: "Un cuaderno.",
          format: "TV",
          episodes: 37,
          seasonYear: 2006,
          startDate: { year: 2006 },
          averageScore: 84,
          genres: ["Mystery", "Psychological"],
          coverImage: { extraLarge: "https://img.anili.st/1535.jpg" },
          tags: [{ name: "Anti-Hero", rank: 88, isGeneralSpoiler: false }],
        },
      },
    };

    expect(EsquemaRespuestaAniList.safeParse(bruto).success).toBe(true);
  });

  it("acepta `Media: null`, que es lo que devuelve cuando no encuentra nada", () => {
    const analisis = EsquemaRespuestaAniList.safeParse({ data: { Media: null } });

    expect(analisis.success).toBe(true);
  });

  it("acepta que falten los campos opcionales: casi todos lo son en AniList", () => {
    const analisis = EsquemaRespuestaAniList.safeParse({
      data: { Media: { id: 1, title: {} } },
    });

    expect(analisis.success).toBe(true);
  });

  it("rechaza una respuesta sin `data`, en vez de tragar `undefined`", () => {
    expect(EsquemaRespuestaAniList.safeParse({ errors: [{ message: "boom" }] }).success).toBe(
      false,
    );
  });
});

describe("mapearMedia", () => {
  const media = {
    id: 1535,
    title: { romaji: "Death Note", english: "Death Note", native: "デスノート" },
    synonyms: ["DN", "デスノート"],
    description: "Un estudiante encuentra un <i>cuaderno</i>.<br>Y decide usarlo.",
    format: "TV",
    episodes: 37,
    seasonYear: 2006,
    averageScore: 84,
    genres: ["Mystery", "Psychological", "Supernatural"],
    coverImage: { extraLarge: "https://img.anili.st/1535.jpg" },
    tags: [
      { name: "Anti-Hero", rank: 88, isGeneralSpoiler: false },
      { name: "Poco relevante", rank: 12, isGeneralSpoiler: false },
      { name: "Spoiler gordo", rank: 95, isGeneralSpoiler: true },
    ],
  };

  it("trae lo que el vault sabe guardar", () => {
    const m = mapearMedia(media);

    expect(m.anilistId).toBe(1535);
    expect(m.tituloIngles).toBe("Death Note");
    expect(m.tituloNativo).toBe("デスノート");
    expect(m.anio).toBe(2006);
    expect(m.totalEpisodios).toBe(37);
    expect(m.formato).toBe("TV");
  });

  it("LA SINOPSIS LLEGA EN TEXTO PLANO, no en HTML", () => {
    const m = mapearMedia(media);

    expect(m.sinopsis).toBe("Un estudiante encuentra un cuaderno.\nY decide usarlo.");
    expect(m.sinopsis).not.toContain("<");
  });

  it("la puntuación pasa de 0–100 a la escala 0–10 de la base", () => {
    // `score` es `numeric(3,1)`: un 84 guardado tal cual no cabe y, si cupiera,
    // el usuario vería «84» donde el diseño espera «8.4».
    expect(mapearMedia(media).puntuacion).toBe("8.4");
  });

  it("un formato que no es de los nuestros se descarta, no se inventa", () => {
    // AniList tiene TV_SHORT y MUSIC, que nuestro CHECK no admite. Guardarlos
    // reventaría el INSERT; traducirlos a TV sería inventarse un dato.
    expect(mapearMedia({ ...media, format: "MUSIC" }).formato).toBeNull();
    expect(mapearMedia({ ...media, format: "TV_SHORT" }).formato).toBeNull();
  });

  it("los géneros oficiales llegan tal cual, sin traducir", () => {
    // Skill §6: «tal cual los devuelve AniList, sin traducir ni reinterpretar».
    expect(mapearMedia(media).generos).toEqual(["Mystery", "Psychological", "Supernatural"]);
  });

  it("de los tags entran los de rank alto, y NUNCA los marcados como spoiler", () => {
    const m = mapearMedia(media);

    expect(m.etiquetasOficiales).toContain("Anti-Hero");
    expect(m.etiquetasOficiales).not.toContain("Poco relevante");
    // Enseñarle al dueño un spoiler en la ficha de algo que aún no ha visto es
    // el peor fallo posible de esta pantalla, y no lo repara nada.
    expect(m.etiquetasOficiales).not.toContain("Spoiler gordo");
  });

  it("lo que falta queda en `null`, sin rellenos inventados", () => {
    const m = mapearMedia({ id: 7, title: {} });

    expect(m.tituloIngles).toBeNull();
    expect(m.sinopsis).toBeNull();
    expect(m.anio).toBeNull();
    expect(m.puntuacion).toBeNull();
    expect(m.portadaUrl).toBeNull();
    expect(m.generos).toEqual([]);
  });

  it("si no hay `seasonYear` usa el año de `startDate`", () => {
    expect(mapearMedia({ id: 7, title: {}, startDate: { year: 1998 } }).anio).toBe(1998);
  });
});
