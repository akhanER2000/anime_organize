import { describe, expect, it } from "vitest";

import {
  OPERACIONES_QUE_REVOCAN,
  evaluarSesion,
  marcaDeRevocacion,
  type EstadoCuenta,
} from "./sesion";

/**
 * Marca de emisión, en MILISEGUNDOS.
 *
 * Se llamaba `iat` y truncaba a segundos, imitando al claim estándar. Era el
 * error: `em` es un claim NUESTRO y no tiene por qué perder precisión. Truncar
 * causó dos fallos opuestos —una cuenta revocada en el mismo segundo de nacer,
 * y una contraseña cambiada que no revocaba— hasta que se dejó de truncar.
 */
function emitido(fecha: Date): number {
  return fecha.getTime();
}

const T0 = new Date("2026-08-23T12:00:00.000Z");
const CUENTA_SANA: EstadoCuenta = {
  deletedAt: null,
  sessionsValidFrom: new Date("2026-08-23T11:00:00.000Z"),
};

describe("sesión válida", () => {
  it("un token emitido después del corte, con la cuenta viva, vale", () => {
    expect(evaluarSesion(CUENTA_SANA, emitido(T0))).toEqual({ valida: true });
  });

  it("un token emitido justo en el corte vale", () => {
    // Al cambiar la contraseña se emite un token nuevo que puede caer en el
    // mismo INSTANTE que el corte. Rechazarlo dejaría al usuario fuera justo
    // después de cambiar su propia contraseña.
    const corte = new Date("2026-08-23T12:00:00.000Z");
    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, emitido(corte))).toEqual({
      valida: true,
    });
  });

  it("UN MILISEGUNDO antes del corte YA está revocado", () => {
    // Esta es la precisión que se ganó al dejar de truncar. Con marcas en
    // segundos, este caso y el anterior eran indistinguibles, y la sesión que
    // se acababa de revocar sobrevivía hasta un segundo entero.
    const corte = new Date("2026-08-23T12:00:00.000Z");
    const justoAntes = emitido(new Date(corte.getTime() - 1));

    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, justoAntes)).toEqual({
      valida: false,
      motivo: "SESION_REVOCADA",
    });
  });
});

describe("BORRADO DE CUENTA · la sesión muere de inmediato", () => {
  it("si el usuario ya no existe, la sesión NO vale", () => {
    // ESTE ES EL AGUJERO QUE CIERRA TODO ESTO: sin la comprobación, el JWT sigue
    // autenticando durante días contra un user_id que ya no existe.
    const v = evaluarSesion(null, emitido(T0));

    expect(v.valida).toBe(false);
    if (v.valida) throw new Error("inalcanzable");
    expect(v.motivo).toBe("USUARIO_NO_EXISTE");
  });

  it("no depende del reloj: un token recién emitido tampoco vale", () => {
    // El borrado no tiene ventana de carrera, a diferencia del cambio de
    // contraseña: aquí manda que la fila no está.
    const recienEmitido = emitido(new Date(T0.getTime() + 60_000));
    expect(evaluarSesion(null, recienEmitido).valida).toBe(false);
  });

  it("una cuenta desactivada tampoco autentica", () => {
    const v = evaluarSesion(
      {
        deletedAt: new Date("2026-08-23T11:30:00.000Z"),
        sessionsValidFrom: CUENTA_SANA.sessionsValidFrom,
      },
      emitido(T0),
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
    const robado = emitido(new Date("2026-08-23T10:00:00.000Z"));
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
    const unSegundoAntes = emitido(new Date(corte.getTime() - 1000));

    expect(
      evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, unSegundoAntes).valida,
    ).toBe(false);
  });

  it("el token nuevo emitido tras el cambio SÍ vale", () => {
    const corte = new Date("2026-08-23T12:00:00.000Z");
    const nuevo = emitido(new Date(corte.getTime() + 1000));

    expect(evaluarSesion({ deletedAt: null, sessionsValidFrom: corte }, nuevo)).toEqual({
      valida: true,
    });
  });
});

describe("marcaDeRevocacion · el instante exacto, sin margen", () => {
  it("NO retrocede: el corte es el momento de revocar", () => {
    // Antes restaba un segundo para absorber la truncación del `iat`. Ese
    // margen mantenía viva un segundo entero la sesión recién revocada, que es
    // justo lo que no puede pasar cuando alguien cambia la contraseña porque
    // cree que se la han robado. Con `em` en milisegundos el margen sobra.
    const ahora = new Date("2026-08-23T12:00:00.400Z");
    expect(marcaDeRevocacion(ahora).getTime()).toBe(ahora.getTime());
  });

  it("revoca de verdad un token emitido milisegundos antes", () => {
    const emitidoEn = new Date("2026-08-23T12:00:00.399Z");
    const revocadoEn = new Date("2026-08-23T12:00:00.400Z");

    const cuenta: EstadoCuenta = {
      deletedAt: null,
      sessionsValidFrom: marcaDeRevocacion(revocadoEn),
    };

    expect(evaluarSesion(cuenta, emitido(emitidoEn)).valida).toBe(false);
  });

  it("no mata el token que se emite justo después de revocar", () => {
    const revocadoEn = new Date("2026-08-23T12:00:00.400Z");
    const emitidoEn = new Date("2026-08-23T12:00:00.401Z");

    const cuenta: EstadoCuenta = {
      deletedAt: null,
      sessionsValidFrom: marcaDeRevocacion(revocadoEn),
    };

    expect(evaluarSesion(cuenta, emitido(emitidoEn)).valida).toBe(true);
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
