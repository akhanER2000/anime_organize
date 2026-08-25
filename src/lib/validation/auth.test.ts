import { describe, expect, it } from "vitest";

import {
  EsquemaLogin,
  EsquemaNombre,
  EsquemaNuevaPassword,
  EsquemaRecuperar,
  EsquemaRegistro,
} from "./auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA IDA Y VUELTA — el fallo que solo vio un navegador.
 *
 * Estos esquemas se usan **a los dos lados de la red**: el cliente valida con
 * ellos por UX, manda al servidor lo que le salió, y el servidor revalida con
 * los mismos por seguridad.
 *
 * Cuando un esquema TRANSFORMA, ese viaje puede no cerrar. Pasó con
 * `EsquemaNombre`: convertía `""` en `null` en el cliente, y en el servidor
 * rechazaba `null` con «Invalid input: expected string, received null». **Todo
 * registro que dejara el nombre en blanco fallaba** — el caso normal, en un
 * campo opcional.
 *
 * No lo vieron el typecheck, el lint, 499 tests de unidad, la auditoría de
 * seguridad ni el verificador de fidelidad. Lo vio Playwright rellenando el
 * formulario, porque es la única prueba que recorre el viaje entero.
 *
 * La regla, y estos tests la fijan para todos los esquemas compartidos:
 * **la ENTRADA de un esquema tiene que aceptar su propia SALIDA.**
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PASSWORD_VALIDA = "una frase larga y tranquila";

describe("IDA Y VUELTA: la salida de un esquema vuelve a entrar por él", () => {
  const CASOS = [
    {
      nombre: "EsquemaRegistro (nombre vacío — EL CASO QUE FALLABA)",
      esquema: EsquemaRegistro,
      entrada: { nombre: "", email: "Rocio@Correo.com ", password: PASSWORD_VALIDA },
    },
    {
      nombre: "EsquemaRegistro (nombre ausente)",
      esquema: EsquemaRegistro,
      entrada: { email: "rocio@correo.com", password: PASSWORD_VALIDA },
    },
    {
      nombre: "EsquemaRegistro (con nombre)",
      esquema: EsquemaRegistro,
      entrada: { nombre: "  Rocío  ", email: "rocio@correo.com", password: PASSWORD_VALIDA },
    },
    {
      nombre: "EsquemaLogin",
      esquema: EsquemaLogin,
      entrada: { email: "  ROCIO@correo.com", password: "lo que sea" },
    },
    {
      nombre: "EsquemaRecuperar",
      esquema: EsquemaRecuperar,
      entrada: { email: "Rocio@Correo.COM" },
    },
    {
      nombre: "EsquemaNuevaPassword",
      esquema: EsquemaNuevaPassword,
      entrada: { token: "un-token-cualquiera", password: PASSWORD_VALIDA },
    },
  ] as const;

  it.each(CASOS)("$nombre", ({ esquema, entrada }) => {
    // Primer parseo: el que hace el CLIENTE.
    const primero = esquema.safeParse(entrada);
    expect(primero.success, "el esquema rechaza una entrada legítima").toBe(true);
    if (!primero.success) return;

    // Segundo parseo: el que hace el SERVIDOR sobre lo que el cliente le mandó.
    const segundo = esquema.safeParse(primero.data);
    expect(
      segundo.success,
      segundo.success
        ? ""
        : `el servidor rechaza lo que produjo el cliente: ` +
            segundo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "),
    ).toBe(true);
    if (!segundo.success) return;

    // Y es IDEMPOTENTE: parsear dos veces da lo mismo que parsear una. Si no lo
    // fuera, el valor cambiaría en cada salto de red.
    expect(segundo.data).toEqual(primero.data);
  });
});

describe("EsquemaNombre", () => {
  it("vacío, en blanco, nulo y ausente son todos `null`", () => {
    // Las cuatro formas de «no puso nombre» tienen que dar el mismo resultado:
    // si no, la base guardaría `""` unas veces y `null` otras.
    for (const v of ["", "   ", null, undefined]) {
      expect(EsquemaNombre.parse(v)).toBeNull();
    }
  });

  it("recorta los espacios de un nombre real", () => {
    expect(EsquemaNombre.parse("  Rocío  ")).toBe("Rocío");
  });

  it("rechaza un nombre absurdamente largo", () => {
    expect(EsquemaNombre.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("EsquemaEmail normaliza para que la clave del limitador sea la misma", () => {
  it("recorta y baja a minúsculas", () => {
    // `users.email` es `citext`, así que la base ya compara sin distinguir caja.
    // Pero la CLAVE del rate limit se calcula sobre este valor: sin normalizar,
    // `A@B.com` y `a@b.com` gastarían cubos distintos y el límite se saltaría
    // cambiando una mayúscula (security.md §5).
    const r = EsquemaRecuperar.parse({ email: "  ROCIO@Correo.Com  " });
    expect(r.email).toBe("rocio@correo.com");
  });
});
