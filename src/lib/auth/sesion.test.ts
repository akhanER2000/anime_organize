import { describe, expect, it } from "vitest";

import {
  OPERACIONES_QUE_REVOCAN,
  evaluarSesion,
  marcaDeRevocacion,
  type EstadoCuenta,
} from "./sesion";

/** `iat` de un JWT: segundos desde epoch, enteros. */
function iat(fecha: Date): number {
  return Math.floor(fecha.getTime() / 1000);
}

const T0 = new Date("2026-08-23T12:00:00.000Z");
const CUENTA_SANA: EstadoCuenta = {
  deletedAt: null,
  sessionsValidFrom: new Date("2026-08-23T11:00:00.000Z"),
};

describe("sesión válida", () => {
  it("un token emitido después del corte, con la cuenta viva, vale", () => {
    expect(evaluarSesion(CUENTA_SANA, iat(T0))).toEqual({ valida: true });
  });

  it("un token emitido justo en el corte vale", () => {
    // Al cambiar la contraseña se emite un token nuevo que puede caer en el mismo
    // segundo que el corte. Rechazarlo dejaría al usuario fuera justo después de
    // cambiar su propia contraseña.
    const corte = new Date("2026-08-23T12:00:00.000Z");
    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, iat(corte))).toEqual({
      valida: true,
    });
  });
});

describe("BORRADO DE CUENTA · la sesión muere de inmediato", () => {
  it("si el usuario ya no existe, la sesión NO vale", () => {
    // ESTE ES EL AGUJERO QUE CIERRA TODO ESTO: sin la comprobación, el JWT sigue
    // autenticando durante días contra un user_id que ya no existe.
    const v = evaluarSesion(null, iat(T0));

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("USUARIO_NO_EXISTE");
  });

  it("no depende del reloj: un token recién emitido tampoco vale", () => {
    // El borrado no tiene ventana de carrera, a diferencia del cambio de
    // contraseña: aquí manda que la fila no está.
    const recienEmitido = iat(new Date(T0.getTime() + 60_000));
    expect(evaluarSesion(null, recienEmitido).valida).toBe(false);
  });

  it("una cuenta desactivada tampoco autentica", () => {
    const v = evaluarSesion(
      { deletedAt: new Date("2026-08-23T11:30:00.000Z"), sessionsValidFrom: CUENTA_SANA.sessionsValidFrom },
      iat(T0),
    );

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("CUENTA_DESACTIVADA");
  });
});

describe("CAMBIO DE CONTRASEÑA · las sesiones anteriores se revocan", () => {
  it("un token emitido ANTES del corte queda revocado", () => {
    // El escenario real: me roban la sesión, cambio la contraseña, y el token
    // robado tiene que dejar de valer. Esto es lo que el usuario cree que pasa
    // al cambiar la contraseña.
    const robado = iat(new Date("2026-08-23T10:00:00.000Z"));
    const cuenta: EstadoCuenta = {
      deletedAt: null,
      sessionsValidFrom: new Date("2026-08-23T11:00:00.000Z"),
    };

    const v = evaluarSesion(cuenta, robado);

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("SESION_REVOCADA");
  });

  it("un token de un segundo antes del corte queda revocado", () => {
    const corte = new Date("2026-08-23T12:00:00.000Z");
    const unSegundoAntes = iat(new Date(corte.getTime() - 1000));

    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, unSegundoAntes).valida).toBe(
      false,
    );
  });

  it("el token nuevo emitido tras el cambio SÍ vale", () => {
    const corte = new Date("2026-08-23T12:00:00.000Z");
    const nuevo = iat(new Date(corte.getTime() + 1000));

    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, nuevo)).toEqual({
      valida: true,
    });
  });
});

describe("marcaDeRevocacion · absorbe el redondeo del iat", () => {
  it("retrocede un segundo respecto al momento de revocar", () => {
    const ahora = new Date("2026-08-23T12:00:00.400Z");
    expect(marcaDeRevocacion(ahora).getTime()).toBe(ahora.getTime() - 1000);
  });

  it("no mata un token legítimo emitido en el mismo segundo", () => {
    // iat va en segundos ENTEROS: un token emitido a las 12:00:00.700 lleva
    // iat = 12:00:00.000. Un corte puesto a 12:00:00.400 sin retroceder lo
    // mataría por un redondeo, no por seguridad.
    const emitido = new Date("2026-08-23T12:00:00.700Z");
    const revocadoEn = new Date("2026-08-23T12:00:00.400Z");

    const cuenta: EstadoCuenta = { deletedAt: null, sessionsValidFrom: marcaDeRevocacion(revocadoEn) };

    expect(evaluarSesion(cuenta, iat(emitido)).valida).toBe(true);
  });

  it("aun retrocediendo, un token de hace una hora sigue revocado", () => {
    const viejo = iat(new Date("2026-08-23T11:00:00.000Z"));
    const cuenta: EstadoCuenta = {
      deletedAt: null,
      sessionsValidFrom: marcaDeRevocacion(new Date("2026-08-23T12:00:00.000Z")),
    };

    expect(evaluarSesion(cuenta, viejo).valida).toBe(false);
  });
});

describe("tokens malformados · ante la duda, fuera", () => {
  it.each([
    ["sin iat", undefined],
    ["iat NaN", Number.NaN],
    ["iat infinito", Number.POSITIVE_INFINITY],
  ])("%s se rechaza", (_caso, valor) => {
    const v = evaluarSesion(CUENTA_SANA, valor);

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("TOKEN_SIN_IAT");
  });

  it("el usuario inexistente se comprueba ANTES que el iat", () => {
    // Si la cuenta no está, da igual cómo sea el token.
    const v = evaluarSesion(null, undefined);

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("USUARIO_NO_EXISTE");
  });
});

describe("operaciones que revocan", () => {
  it("borrar la cuenta y cambiar la contraseña están en la lista", () => {
    expect(OPERACIONES_QUE_REVOCAN).toContain("BORRADO_CUENTA");
    expect(OPERACIONES_QUE_REVOCAN).toContain("CAMBIO_PASSWORD");
    expect(OPERACIONES_QUE_REVOCAN).toContain("RESET_PASSWORD");
    expect(OPERACIONES_QUE_REVOCAN).toContain("CIERRE_TODAS_SESIONES");
  });
});
