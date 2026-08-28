import { describe, expect, it } from "vitest";

import { variablesDeConsulta } from "./consultas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL FALLO QUE DECÍA «SIN RESULTADO» SOBRE ANIMES QUE SÍ EXISTEN.
 *
 * `npm run enrich -- --limite 3` informó de «3 sin resultado» sobre tres
 * animes que están en AniList. Ningún error, ningún log, ningún indicador en
 * rojo: la salida parecía información buena sobre el catálogo.
 *
 * La causa: se mandaba `{ id: null, busqueda: "…" }`. En GraphQL un argumento
 * puesto a `null` **es un filtro por nulo**, no un argumento ausente, y AniList
 * responde 404 con `data.Media: null` — indistinguible de «no existe».
 *
 * Es de la familia de «la operación tuvo éxito, ¿SOBRE QUÉ?»: la petición se
 * hizo, la respuesta se parseó, el resultado se guardó… y era sobre una
 * consulta que nunca podía encontrar nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("variablesDeConsulta", () => {
  it("al buscar por título NO manda `id`, ni siquiera en `null`", () => {
    const variables = variablesDeConsulta({ busqueda: "Higurashi no Naku Koro ni" });

    expect(variables).toEqual({ busqueda: "Higurashi no Naku Koro ni" });
    // La clave no puede estar presente. `toEqual` ya lo comprueba, pero esto
    // dice explícitamente qué era el bug, que es lo que se lee dentro de un año.
    expect(Object.keys(variables)).not.toContain("id");
  });

  it("al buscar por id NO manda `busqueda`", () => {
    const variables = variablesDeConsulta({ anilistId: 1535 });

    expect(variables).toEqual({ id: 1535 });
    expect(Object.keys(variables)).not.toContain("busqueda");
  });
});
