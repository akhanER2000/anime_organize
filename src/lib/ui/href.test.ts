import { describe, expect, it } from "vitest";

import { esHrefSeguro } from "./href";

/**
 * `continue_link.url` la pega EL USUARIO (security.md §8). Un `href` con
 * esquema ejecutable es XSS almacenado: se guarda una vez y dispara cada vez
 * que alguien abre la ficha.
 */
describe("esHrefSeguro", () => {
  it("acepta http y https", () => {
    expect(esHrefSeguro("https://animeflv.net/ver/algo-7")).toBe(true);
    expect(esHrefSeguro("http://jkanime.net/algo")).toBe(true);
  });

  it("acepta rutas propias y anclas", () => {
    expect(esHrefSeguro("/app/anime/123")).toBe(true);
    expect(esHrefSeguro("#seccion")).toBe(true);
  });

  it("RECHAZA los esquemas que ejecutan código", () => {
    for (const malo of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(esHrefSeguro(malo)).toBe(false);
    }
  });

  it("RECHAZA los disfraces que engañan a un startsWith", () => {
    // Estos son exactamente los que pasan una comparación de cadenas y no
    // pasan el parser de URL del navegador.
    for (const disfraz of [
      " javascript:alert(1)",
      "\tjavascript:alert(1)",
      "\njavascript:alert(1)",
      "java\tscript:alert(1)",
      "JAVASCRIPT:alert(1)",
    ]) {
      expect(esHrefSeguro(disfraz)).toBe(false);
    }
  });

  it("rechaza basura que no es ni URL ni ruta", () => {
    expect(esHrefSeguro("")).toBe(false);
    expect(esHrefSeguro("no es una url")).toBe(false);
  });
});
