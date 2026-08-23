import { describe, expect, it } from "vitest";

import { comprobarOrigen, origenesPermitidos } from "./csrf";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * Mutación: en `comprobarOrigen`, hacer que el camino sin `Origin` ni `Referer`
 * devuelva `{ permitido: true }` (el fallo-abierto «por compatibilidad»).
 *
 * Resultado MEDIDO: **4 tests en rojo**
 *   · «sin Origin ni Referer se RECHAZA»
 *   · «Origin literal 'null' se trata como ausente y se rechaza»
 *   · «Origin vacío se trata como ausente y se rechaza»
 *   · «Origin que no es URL se trata como ausente y se rechaza»
 *
 * Los tres últimos son los que de verdad valen la pena: `Origin: null` lo manda
 * un iframe con `sandbox`, y con el fallo-abierto pasaría. Restaurado y verde
 * (25/25).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PERMITIDOS = ["https://vault.ejemplo.test"] as const;

function peticion(metodo: string, cabeceras: Record<string, string>) {
  return { metodo, cabeceras: new Headers(cabeceras), origenesPermitidos: PERMITIDOS };
}

describe("métodos que no mutan", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])("%s pasa sin comprobar el origen", (metodo) => {
    // Un GET no cambia estado: exigirle origen rompería la navegación normal.
    expect(comprobarOrigen(peticion(metodo, {}))).toEqual({ permitido: true });
  });
});

describe("métodos que mutan · Origin", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])(
    "%s con el origen correcto pasa",
    (metodo) => {
      const r = comprobarOrigen(peticion(metodo, { origin: "https://vault.ejemplo.test" }));
      expect(r).toEqual({ permitido: true });
    },
  );

  it("RECHAZA un origen ajeno", () => {
    // El ataque: una página del atacante hace POST con la cookie de sesión de la
    // víctima. El navegador manda `Origin` con SU dominio y no lo puede mentir.
    const r = comprobarOrigen(peticion("POST", { origin: "https://sitio-del-atacante.test" }));

    expect(r).toEqual({ permitido: false, motivo: "ORIGEN_NO_PERMITIDO" });
  });

  it("RECHAZA un subdominio parecido", () => {
    const r = comprobarOrigen(
      peticion("POST", { origin: "https://vault.ejemplo.test.atacante.test" }),
    );
    expect(r.permitido).toBe(false);
  });

  it("RECHAZA el mismo host por http cuando se espera https", () => {
    // El origen incluye el esquema: `http://` y `https://` NO son el mismo origen.
    const r = comprobarOrigen(peticion("POST", { origin: "http://vault.ejemplo.test" }));
    expect(r.permitido).toBe(false);
  });

  it("RECHAZA el mismo host en otro puerto", () => {
    const r = comprobarOrigen(peticion("POST", { origin: "https://vault.ejemplo.test:8443" }));
    expect(r.permitido).toBe(false);
  });

  it("ignora la ruta: compara solo el origen", () => {
    const r = comprobarOrigen(
      peticion("POST", { origin: "https://vault.ejemplo.test/lo-que-sea" }),
    );
    expect(r.permitido).toBe(true);
  });
});

describe("respaldo por Referer", () => {
  it("sin Origin, un Referer correcto vale", () => {
    // Algunas configuraciones de privacidad omiten `Origin`.
    const r = comprobarOrigen(
      peticion("POST", { referer: "https://vault.ejemplo.test/app/ajustes" }),
    );
    expect(r).toEqual({ permitido: true });
  });

  it("un Referer ajeno se rechaza", () => {
    const r = comprobarOrigen(peticion("POST", { referer: "https://atacante.test/pagina" }));
    expect(r).toEqual({ permitido: false, motivo: "ORIGEN_NO_PERMITIDO" });
  });

  it("Origin manda sobre Referer cuando están los dos", () => {
    // Si `Origin` es malo, un `Referer` bueno no lo rescata.
    const r = comprobarOrigen(
      peticion("POST", {
        origin: "https://atacante.test",
        referer: "https://vault.ejemplo.test/app",
      }),
    );
    expect(r.permitido).toBe(false);
  });
});

describe("FALLA CERRADO · la ausencia de cabeceras no es un permiso", () => {
  it("sin Origin ni Referer se RECHAZA", () => {
    const r = comprobarOrigen(peticion("POST", {}));
    expect(r).toEqual({ permitido: false, motivo: "SIN_ORIGEN" });
  });

  it.each([
    ["Origin literal 'null'", { origin: "null" }],
    ["Origin vacío", { origin: "" }],
    ["Origin que no es URL", { origin: "no-soy-una-url" }],
  ])("%s se trata como ausente y se rechaza", (_caso, cabeceras) => {
    // `Origin: null` lo manda un iframe con sandbox, entre otros. Aceptarlo
    // sería aceptar justo uno de los vectores.
    const r = comprobarOrigen(peticion("POST", cabeceras));
    expect(r.permitido).toBe(false);
  });
});

describe("origenesPermitidos", () => {
  it("en producción solo vale AUTH_URL", () => {
    const lista = origenesPermitidos({
      authUrl: "https://vault.ejemplo.test",
      esProduccion: true,
    });

    expect(lista).toEqual(["https://vault.ejemplo.test"]);
    expect(lista.some((o) => o.includes("localhost"))).toBe(false);
  });

  it("en desarrollo se añade localhost", () => {
    const lista = origenesPermitidos({ authUrl: undefined, esProduccion: false });
    expect(lista).toContain("http://localhost:3000");
  });

  it("normaliza AUTH_URL a origen, quitando la ruta", () => {
    const lista = origenesPermitidos({
      authUrl: "https://vault.ejemplo.test/app/",
      esProduccion: true,
    });
    expect(lista).toEqual(["https://vault.ejemplo.test"]);
  });

  it("en producción sin AUTH_URL la lista queda VACÍA y todo se rechaza", () => {
    // Preferible a inventar un origen: si falta la configuración, nada muta.
    const lista = origenesPermitidos({ authUrl: undefined, esProduccion: true });
    expect(lista).toEqual([]);

    const r = comprobarOrigen({
      metodo: "POST",
      cabeceras: new Headers({ origin: "https://vault.ejemplo.test" }),
      origenesPermitidos: lista,
    });
    expect(r.permitido).toBe(false);
  });
});
