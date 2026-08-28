import { describe, expect, it } from "vitest";

import { SITIOS_DE_SEMILLA, siguienteEtiquetaDeEspejo } from "./sitios";
import { TIPOS_SITIO } from "./enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE ESTOS TESTS PROTEGEN.
 *
 * 1. **Que la semilla no traiga ni un dominio.** El encargo lo subraya: los
 *    espejos los pone su dueño porque los dominios cambian, y uno hardcodeado
 *    envía al usuario a un sitio que ya no es de quien era.
 *
 * 2. **Que las etiquetas de espejo no se repitan al borrar.** Con `n + 1` sobre
 *    el número de filas, borrar V2 de tres deja V1 y V3 y el siguiente vuelve a
 *    ser V3 — dos espejos con la misma etiqueta, que es justo lo que el usuario
 *    usa para distinguirlos.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-28):
 *   Poniendo una `url` en un sitio de la semilla → rojo.
 *   Cambiando `mayor + 1` por `existentes.length` → 4 rojos, el del borrado
 *   entre ellos.
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describe("SITIOS_DE_SEMILLA", () => {
  it("trae los trece del encargo", () => {
    expect(SITIOS_DE_SEMILLA).toHaveLength(13);
    expect(SITIOS_DE_SEMILLA.map((s) => s.nombre)).toContain("Crunchyroll");
    expect(SITIOS_DE_SEMILLA.map((s) => s.nombre)).toContain("OtakusTV");
  });

  it("NO TRAE NI UN DOMINIO", () => {
    // La razón está en la cabecera de `sitios.ts`. Si alguien añade una `url`
    // aquí, este test lo para: es una verdad que caduca escrita en el código.
    for (const sitio of SITIOS_DE_SEMILLA) {
      const texto = JSON.stringify(sitio);
      expect(texto, `${sitio.nombre} trae una dirección en la semilla`).not.toMatch(
        /https?:\/\/|\.(net|com|org|tv|to|io)\b/i,
      );
    }
  });

  it("los slugs son únicos: es la clave de la deduplicación al re-sembrar", () => {
    const slugs = SITIOS_DE_SEMILLA.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("todos los tipos están en el dominio cerrado", () => {
    for (const sitio of SITIOS_DE_SEMILLA) {
      expect(TIPOS_SITIO).toContain(sitio.tipo);
    }
  });

  it("el orden no empata: dos sitios con el mismo `sort` los ordena Postgres", () => {
    const ordenes = SITIOS_DE_SEMILLA.map((s) => s.orden);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });
});

describe("siguienteEtiquetaDeEspejo", () => {
  it("el primero es V1", () => {
    expect(siguienteEtiquetaDeEspejo([])).toBe("V1");
  });

  it("sigue la serie", () => {
    expect(siguienteEtiquetaDeEspejo(["V1"])).toBe("V2");
    expect(siguienteEtiquetaDeEspejo(["V1", "V2"])).toBe("V3");
  });

  it("BORRAR UNO DEL MEDIO NO REPITE ETIQUETA", () => {
    // El caso que rompe la versión ingenua: quedan V1 y V3, y `length + 1`
    // devolvería V3 otra vez.
    expect(siguienteEtiquetaDeEspejo(["V1", "V3"])).toBe("V4");
  });

  it("no recicla: si se borró el último, el siguiente NO vuelve a ese número", () => {
    // Contar filas daría V3. Se toma el mayor USADO, así que da V4 — y eso
    // además cuenta que hubo un V3 que ya no está.
    expect(siguienteEtiquetaDeEspejo(["V1", "V2"])).toBe("V3");
    expect(siguienteEtiquetaDeEspejo(["V4", "V1"])).toBe("V5");
  });

  it("una etiqueta que el usuario escribió a mano no rompe la serie", () => {
    // `label` es texto libre en la base: alguien puede llamar a uno «Espejo
    // bueno». Se ignora para calcular el número en vez de reventar.
    expect(siguienteEtiquetaDeEspejo(["V1", "Espejo bueno", "V2"])).toBe("V3");
    expect(siguienteEtiquetaDeEspejo(["sin número"])).toBe("V1");
  });

  it("acepta minúsculas y espacios sobrantes", () => {
    expect(siguienteEtiquetaDeEspejo([" v2 "])).toBe("V3");
  });
});
