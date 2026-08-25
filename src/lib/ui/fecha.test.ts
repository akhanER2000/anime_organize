import { describe, expect, it } from "vitest";

import { fechaCorta, fechaIso } from "./fecha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA ZONA HORARIA ES LO ÚNICO QUE IMPORTA AQUÍ.
 *
 * El formato es cosmético; la zona es un bug de datos. Este módulo nació porque
 * la ficha y la vista lista tenían cada una su formateador y **una fijaba la
 * zona y la otra no**, así que la misma marca se pintaba con un día de
 * diferencia según la pantalla.
 *
 * En Vercel las funciones corren en UTC y coincidían, así que el fallo era
 * invisible en producción y visible solo en local: la peor forma de tenerlo,
 * porque se descarta como «cosa de mi máquina».
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   Quitando `timeZone: "UTC"` de `FORMATO_CORTO` → rojo el caso de la
 *   madrugada, con el día equivocado. Restaurado → verde. La mutación solo se
 *   nota si el proceso NO corre en UTC, que es exactamente por lo que el test
 *   usa una marca de las primeras horas del día.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("fechaCorta", () => {
  it("da «03 ene 2026», como el artboard", () => {
    expect(fechaCorta(new Date("2026-01-03T12:00:00.000Z"))).toBe("03 ene 2026");
  });

  it("LA MADRUGADA NO CAMBIA DE DÍA según dónde corra el servidor", () => {
    // Este es EL caso. Sin `timeZone: "UTC"` esto sale «02 ene 2026» en
    // cualquier zona negativa —medido en America/Santiago— y «03 ene 2026» en
    // Vercel. El mismo anime, dos fechas distintas según la pantalla.
    expect(fechaCorta(new Date("2026-01-03T00:30:00.000Z"))).toBe("03 ene 2026");
  });

  it("y el final del día tampoco, por el otro lado", () => {
    // El simétrico: una marca de las últimas horas UTC se iría al día siguiente
    // en cualquier zona positiva (Europa/Madrid es +1 o +2).
    expect(fechaCorta(new Date("2026-01-03T23:30:00.000Z"))).toBe("03 ene 2026");
  });

  it("no depende de la versión de ICU: el mes abreviado va sin punto", () => {
    // `es-ES` escribe «ene» en unas versiones de Node y «ene.» en otras.
    expect(fechaCorta(new Date("2026-01-03T12:00:00.000Z"))).not.toContain(".");
  });

  it("una fecha inválida no escupe «Invalid Date» ni revienta el render", () => {
    // Medido: `Intl.DateTimeFormat.prototype.format(new Date("x"))` LANZA
    // `RangeError`. En un Server Component eso no es un texto feo: es la
    // pantalla entera caída.
    expect(fechaCorta(new Date("no es una fecha"))).toBe("");
  });
});

describe("fechaIso", () => {
  it("da el ISO que espera el atributo dateTime de un <time>", () => {
    expect(fechaIso(new Date("2026-01-03T00:30:00.000Z"))).toBe("2026-01-03T00:30:00.000Z");
  });

  it("nombra el MISMO día que fechaCorta", () => {
    // En la vista lista, el texto visible y el atributo `dateTime` de la misma
    // celda salían de sitios distintos y podían nombrar días distintos. Salen
    // del mismo módulo justamente para que esto se pueda afirmar.
    const marca = new Date("2026-01-03T00:30:00.000Z");

    expect(fechaIso(marca).slice(0, 10)).toBe("2026-01-03");
    expect(fechaCorta(marca)).toContain("03");
    expect(fechaCorta(marca)).toContain("ene");
  });

  it("una fecha inválida da cadena vacía, no lanza", () => {
    expect(fechaIso(new Date("no es una fecha"))).toBe("");
  });
});
