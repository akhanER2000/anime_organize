import { describe, expect, it } from "vitest";

import { esHrefSeguro } from "@/lib/ui/href";

import {
  ANCLAS_PINTADAS,
  anclasMuertas,
  botonesSolidos,
  CTA_PRINCIPAL,
  CTA_SECUNDARIO,
  CTAS_LANDING,
  destinosAjenos,
  ENLACES_LANDING,
  ENLACES_NAV,
  idDeAncla,
  RUTA_LOGIN,
  RUTA_REGISTRO,
} from "./enlaces";

/**
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   Se cambió `#sitios` por `#sitios-de-streaming` en `ENLACES_NAV`
 *   → «ninguna ancla de la navegación apunta a un id que la pantalla no pinta»
 *   en rojo, señalando `sitios-de-streaming`. Restaurado.
 *
 *   Se añadió `variante: "solido"` al CTA secundario
 *   → «la pantalla declara UN SOLO botón de relleno dorado sólido» en rojo con
 *   2 sólidos. Restaurado.
 */

describe("los destinos de la landing", () => {
  it("ninguna ancla de la navegación apunta a un id que la pantalla no pinta", () => {
    const muertas = anclasMuertas(ENLACES_NAV, ANCLAS_PINTADAS);

    expect(muertas).toEqual([]);
  });

  it("la landing no enlaza a ningún sitio que no sea suyo", () => {
    const ajenos = destinosAjenos(ENLACES_LANDING);

    expect(ajenos).toEqual([]);
  });

  it("todos los destinos son href renderizables", () => {
    const inseguros = ENLACES_LANDING.filter((enlace) => !esHrefSeguro(enlace.href));

    expect(inseguros).toEqual([]);
  });

  it("«Entrar al Vault» lleva a /login y «Crear cuenta» a /registro", () => {
    expect(CTA_PRINCIPAL.href).toBe(RUTA_LOGIN);
    expect(CTA_SECUNDARIO.href).toBe(RUTA_REGISTRO);
  });
});

describe("la regla del oro nº 3", () => {
  it("la pantalla declara UN SOLO botón de relleno dorado sólido", () => {
    const solidos = botonesSolidos(CTAS_LANDING);

    expect(solidos).toHaveLength(1);
  });

  it("y ese botón es «Entrar al Vault»", () => {
    const [unico] = botonesSolidos(CTAS_LANDING);

    expect(unico?.etiqueta).toBe("Entrar al Vault");
  });
});

describe("idDeAncla", () => {
  it("devuelve el id de un ancla", () => {
    expect(idDeAncla("#precios")).toBe("precios");
  });

  it("devuelve null para una ruta", () => {
    expect(idDeAncla("/login")).toBeNull();
  });

  it("devuelve null para una almohadilla sola: no es un destino", () => {
    expect(idDeAncla("#")).toBeNull();
  });
});

describe("anclasMuertas", () => {
  it("delata el ancla que no existe, y solo esa", () => {
    const muertas = anclasMuertas(
      [
        { etiqueta: "Viva", href: "#caracteristicas" },
        { etiqueta: "Muerta", href: "#inventada" },
        { etiqueta: "Ruta", href: "/login" },
      ],
      ANCLAS_PINTADAS,
    );

    expect(muertas).toEqual(["inventada"]);
  });
});
