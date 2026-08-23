import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COLOR_CROMO_NAVEGADOR } from "./cromo-navegador";

/**
 * Una excepción a una regla solo es aceptable si algo impide que se convierta en
 * una deriva. Esto es ese algo.
 */
describe("el color del cromo no se desincroniza del diseño", () => {
  const tokens = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../design/tokens.json", import.meta.url)), "utf-8"),
  ) as Record<string, string>;

  it("coincide con --color-void de design/tokens.json", () => {
    const enElDiseno = tokens["--color-void"];

    expect(enElDiseno, "design/tokens.json debe definir --color-void").toBeDefined();
    expect(COLOR_CROMO_NAVEGADOR.toLowerCase()).toBe(enElDiseno?.toLowerCase());
  });

  it("es un hex de 6 dígitos: el navegador no acepta otra cosa", () => {
    expect(COLOR_CROMO_NAVEGADOR).toMatch(/^#[0-9a-f]{6}$/);
  });
});
