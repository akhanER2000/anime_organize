import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ESCALA_TIPOGRAFICA, cn } from "./cn";

/**
 * `cn()` no es un ayudante cosmético: si `twMerge` no conoce la escala de este
 * proyecto, **borra en silencio la mitad del sistema visual** y nada falla —
 * ni el build, ni el lint, ni un test—. Simplemente el diseño se aplica a
 * medias en cada pantalla.
 *
 * Estos casos son los que se midieron rotos contra el artboard 07. Ver la
 * cabecera de `cn.ts` para el daño concreto.
 */
describe("cn · el tamaño y el color no se pisan", () => {
  it("un tamaño de la escala SOBREVIVE junto a un color arbitrario", () => {
    // Este era el fallo de las etiquetas CORREO / CONTRASEÑA: salían a 15 px
    // en vez de a 11 porque `text-etiqueta` desaparecía.
    const r = cn("font-ui text-etiqueta uppercase text-[var(--gold-300)]");
    expect(r).toContain("text-etiqueta");
    expect(r).toContain("text-[var(--gold-300)]");
  });

  it("un color arbitrario SOBREVIVE aunque la pantalla añada un tamaño después", () => {
    // Este era el fallo de los enlaces: «¿Olvidaste?» y «Crear una» perdían el
    // oro en cuanto la pantalla pasaba su propio `text-ui-s`.
    const r = cn("text-[var(--gold-300)] underline", "text-ui-s");
    expect(r).toContain("text-[var(--gold-300)]");
    expect(r).toContain("text-ui-s");
  });

  it("pero un tamaño SÍ pisa a otro tamaño: gana el último", () => {
    expect(cn("text-ui", "text-ui-s")).toBe("text-ui-s");
    expect(cn("text-display-l", "text-titulo-s")).toBe("text-titulo-s");
  });

  it("y un color SÍ pisa a otro color: gana el último", () => {
    expect(cn("text-gold-300", "text-gold-200")).toBe("text-gold-200");
    expect(cn("text-[var(--gold-300)]", "text-[var(--gold-200)]")).toBe("text-[var(--gold-200)]");
  });

  it("el resto de conflictos de Tailwind siguen resolviéndose como siempre", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
    expect(cn("bg-slate-900", "bg-slate-850")).toBe("bg-slate-850");
    expect(cn("h-4 w-4", "h-6")).toBe("w-4 h-6");
  });

  it("`className` de quien llama va el último y gana, que es el contrato", () => {
    // Las primitivas prometen esto en su TSDoc: quien pasa `className` manda.
    const base = "text-ui text-[var(--porcelain-200)]";
    expect(cn(base, "text-cuerpo-s")).toContain("text-cuerpo-s");
    expect(cn(base, "text-cuerpo-s")).not.toContain("text-ui");
  });
});

describe("la escala declarada no se desincroniza de globals.css", () => {
  it("todo `--text-*` de @theme está en ESCALA_TIPOGRAFICA", () => {
    // Sin esto, añadir un tamaño nuevo al tema y olvidarlo aquí reintroduce el
    // fallo original SOLO para ese tamaño, que es la forma más difícil de verlo.
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf-8");

    const enElTema = [...css.matchAll(/^\s*--text-([a-z0-9-]+)\s*:/gm)]
      .map((m) => m[1] ?? "")
      // Tailwind admite `--text-x--line-height` como acompañante del tamaño:
      // no es un tamaño en sí, es su interlineado.
      .filter((n) => !n.includes("--line-height"));

    expect(enElTema.length).toBeGreaterThan(0);

    const declarados = new Set<string>(ESCALA_TIPOGRAFICA);
    const olvidados = enElTema.filter((n) => !declarados.has(n));

    expect(olvidados).toEqual([]);
  });

  it("y no sobra ninguno: cada nombre declarado existe en el tema", () => {
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf-8");
    const inventados = ESCALA_TIPOGRAFICA.filter((n) => !css.includes(`--text-${n}:`));
    expect(inventados).toEqual([]);
  });
});
