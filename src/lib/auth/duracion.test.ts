import { describe, expect, it } from "vitest";

import {
  CORTA_POR_DEFECTO,
  LARGA_POR_DEFECTO,
  duracionDeSesionSegundos,
  segundosRestantes,
  sesionCaducada,
} from "./duracion";

/**
 * La lógica pura de «Recordarme». Lo que estos tests NO demuestran es que esté
 * enchufada: para eso está `revocacion.camino-real.test.ts`, que inicia sesión
 * de verdad, decodifica la cookie que devuelve el servidor y comprueba el `exp`
 * del token. Las dos preguntas son distintas y hacen falta las dos
 * (`testing.md` § «Verificación por el CAMINO REAL»).
 */
describe("duracionDeSesionSegundos", () => {
  it("desmarcada = 12 horas · marcada = 30 días", () => {
    expect(duracionDeSesionSegundos(false, {})).toBe(12 * 3600);
    expect(duracionDeSesionSegundos(true, {})).toBe(30 * 24 * 3600);
    expect(CORTA_POR_DEFECTO).toBe(12 * 3600);
    expect(LARGA_POR_DEFECTO).toBe(30 * 24 * 3600);
  });

  it("la larga es MÁS larga que la corta, no al revés", () => {
    // Parece obvio y es justo lo que se invierte al copiar y pegar.
    expect(duracionDeSesionSegundos(true, {})).toBeGreaterThan(duracionDeSesionSegundos(false, {}));
  });

  it("el entorno puede acortarlas, que es lo que permite probarlas de verdad", () => {
    expect(duracionDeSesionSegundos(false, { AUTH_SESION_CORTA_SEGUNDOS: "3" })).toBe(3);
    expect(duracionDeSesionSegundos(true, { AUTH_SESION_LARGA_SEGUNDOS: "300" })).toBe(300);
  });

  it("un valor inválido FALLA RUIDOSAMENTE, no cae al valor por defecto", () => {
    // Caer al valor por defecto en silencio es la clase de configuración que
    // parece aplicada y no lo está. Es la misma decisión que en `entorno.ts`.
    for (const malo of ["si", "12h", "-1", "0", "3.5", "  "]) {
      const entorno = { AUTH_SESION_CORTA_SEGUNDOS: malo };
      if (malo.trim() === "") {
        expect(duracionDeSesionSegundos(false, entorno)).toBe(CORTA_POR_DEFECTO);
      } else {
        expect(
          () => duracionDeSesionSegundos(false, entorno),
          `«${malo}» debería lanzar`,
        ).toThrow();
      }
    }
  });

  it("y hay TOPE: 90 días es el máximo, ponga lo que ponga el entorno", () => {
    // No protege de un atacante —quien edita las variables ya tiene el
    // despliegue—: protege de un cero de más al teclear.
    const noventaDias = 90 * 24 * 3600;
    expect(
      duracionDeSesionSegundos(true, { AUTH_SESION_LARGA_SEGUNDOS: String(noventaDias) }),
    ).toBe(noventaDias);
    expect(() =>
      duracionDeSesionSegundos(true, { AUTH_SESION_LARGA_SEGUNDOS: String(noventaDias + 1) }),
    ).toThrow(/tope/i);
  });
});

describe("sesionCaducada · la cuenta es ABSOLUTA, desde el authorize", () => {
  const T0 = 1_700_000_000_000;

  it("dentro de plazo, vale", () => {
    expect(
      sesionCaducada({ emitidoMs: T0, recordarme: false, ahoraMs: T0 + 11 * 3600 * 1000 }),
    ).toBe(false);
  });

  it("pasadas las 12 horas, no vale", () => {
    expect(
      sesionCaducada({ emitidoMs: T0, recordarme: false, ahoraMs: T0 + 12 * 3600 * 1000 }),
    ).toBe(true);
  });

  it("marcada, a los 12 días sigue valiendo", () => {
    expect(
      sesionCaducada({ emitidoMs: T0, recordarme: true, ahoraMs: T0 + 12 * 24 * 3600 * 1000 }),
    ).toBe(false);
  });

  it("marcada, a los 31 días ya no", () => {
    expect(
      sesionCaducada({ emitidoMs: T0, recordarme: true, ahoraMs: T0 + 31 * 24 * 3600 * 1000 }),
    ).toBe(true);
  });

  it("NO SE RENUEVA CON EL USO: navegar no alarga la sesión", () => {
    // Es la razón por la que la caducidad se cuenta desde `em` y no desde la
    // última actividad. Auth.js refirma el JWT en cada navegación; con una
    // caducidad deslizante, quien robara la cookie y siguiera navegando la
    // mantendría viva indefinidamente. Es el mismo mecanismo que destrozó la
    // revocación de sesiones en su día.
    const emitido = T0;
    const trece = T0 + 13 * 3600 * 1000;

    // Aunque «acaba de navegar», la marca de emisión sigue siendo la del login.
    expect(sesionCaducada({ emitidoMs: emitido, recordarme: false, ahoraMs: trece })).toBe(true);
  });

  it("un token SIN marca de emisión se considera caducado", () => {
    // No se puede fechar, así que no se puede saber si está dentro de plazo.
    expect(sesionCaducada({ emitidoMs: undefined, recordarme: true })).toBe(true);
    expect(sesionCaducada({ emitidoMs: Number.NaN, recordarme: true })).toBe(true);
  });
});

describe("segundosRestantes · lo que se le pone al `exp` del JWT", () => {
  const T0 = 1_700_000_000_000;

  it("recién emitido, quedan las 12 horas enteras", () => {
    expect(segundosRestantes({ emitidoMs: T0, recordarme: false, ahoraMs: T0 })).toBe(12 * 3600);
  });

  it("a mitad de camino, queda la mitad", () => {
    expect(
      segundosRestantes({ emitidoMs: T0, recordarme: false, ahoraMs: T0 + 6 * 3600 * 1000 }),
    ).toBe(6 * 3600);
  });

  it("NUNCA devuelve cero o menos", () => {
    // Un `maxAge` de 0 produciría un token ya caducado en el momento de
    // emitirlo, y eso echaría al usuario justo después de acertar la contraseña.
    expect(
      segundosRestantes({ emitidoMs: T0, recordarme: false, ahoraMs: T0 + 99 * 3600 * 1000 }),
    ).toBe(1);
  });
});
