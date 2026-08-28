import { describe, expect, it } from "vitest";

import { titulosDeBusqueda } from "./busqueda-anilist";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO EXISTE, MEDIDO CONTRA ANILIST DE VERDAD (2026-08-28).
 *
 * Los títulos del vault los escribió el dueño, no un catálogo. Dos de sus 83
 * no los encuentra AniList tal cual, y por motivos distintos:
 *
 * | título del vault | qué pasa |
 * |---|---|
 * | `Death Note (Temporada 1 & 2 )` | lleva SU anotación entre paréntesis |
 * | `…Dark Elf ga Isekai kara Oikaketekita` | AniList lo escribe `Oikakete Kita` |
 *
 * Medido: el primero da 404 y `Death Note` da 200; el segundo da 404 y
 * `Chotto dake Ai ga Omoi Dark Elf` da 200.
 *
 * ── ESTO NO ES INVENTARSE DATOS ──────────────────────────────────────────
 *
 * La tercera regla del proyecto es que no se inventan datos de los animes del
 * dueño. Aquí no se inventa ninguno: se prueban varias formas de **preguntar**,
 * y la respuesta sigue viniendo entera de AniList. Lo que no se toca nunca es
 * el título guardado.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("titulosDeBusqueda", () => {
  it("el primero es SIEMPRE el título tal cual lo escribió el dueño", () => {
    expect(titulosDeBusqueda("Death Note (Temporada 1 & 2 )")[0]).toBe(
      "Death Note (Temporada 1 & 2 )",
    );
  });

  it("propone el título sin la anotación entre paréntesis", () => {
    expect(titulosDeBusqueda("Death Note (Temporada 1 & 2 )")).toContain("Death Note");
  });

  it("también quita los corchetes, que es la otra forma de anotar", () => {
    expect(titulosDeBusqueda("Monster [BD 1080p]")).toContain("Monster");
  });

  it("propone un prefijo corto para los títulos largos", () => {
    // El caso medido: AniList escribe `Oikakete Kita` con espacio y el dueño
    // lo tiene junto, así que la coincidencia sólo llega si se acorta.
    const intentos = titulosDeBusqueda(
      "Chotto dake Ai ga Omoi Dark Elf ga Isekai kara Oikaketekita",
    );

    expect(intentos).toContain("Chotto dake Ai ga Omoi Dark");
  });

  it("NO propone un prefijo cuando el título ya es corto", () => {
    // Acortar `Angel Beats` a `Angel` traería otra serie. Un intento de más no
    // es gratis: es una coincidencia equivocada guardada en el vault.
    expect(titulosDeBusqueda("Angel Beats")).toEqual(["Angel Beats"]);
  });

  it("no repite intentos cuando las tres formas coinciden", () => {
    expect(titulosDeBusqueda("Steins;Gate")).toEqual(["Steins;Gate"]);
  });

  it("nunca devuelve una cadena vacía, aunque el título sea sólo una anotación", () => {
    const intentos = titulosDeBusqueda("(2020)");

    expect(intentos).not.toContain("");
    expect(intentos[0]).toBe("(2020)");
  });

  it("conserva el año cuando ES el título, no una anotación", () => {
    // `Uchuu Senkan Yamato 2199`: el número es parte del nombre. Se conserva,
    // igual que en `normalizarTitulo`.
    expect(titulosDeBusqueda("Uchuu Senkan Yamato 2199")[0]).toBe("Uchuu Senkan Yamato 2199");
  });

  it("como mucho tres intentos: cada uno es una petición a un tercero", () => {
    const intentos = titulosDeBusqueda(
      "Zutto Mae kara Suki deshita.: Kokuhaku Jikkou Iinkai (OVA)",
    );

    expect(intentos.length).toBeLessThanOrEqual(3);
  });
});
