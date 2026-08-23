import { describe, expect, it } from "vitest";

import {
  BANDERAS,
  ErrorConfiguracion,
  booleano,
  entero,
  seExigeVerificacionEmail,
  textoObligatorio,
  textoOpcional,
  validarEntorno,
} from "./entorno";

/** Entorno de mentira, para no tocar `process.env` entre tests. */
function env(valores: Record<string, string>): NodeJS.ProcessEnv {
  return valores as NodeJS.ProcessEnv;
}

describe("booleano · valores válidos", () => {
  it.each([
    ["true", true],
    ["false", false],
    ["TRUE", true],
    ["False", false],
    ["  true  ", true],
    ["  FALSE  ", false],
  ])("acepta %s", (valor, esperado) => {
    expect(booleano("X", { porDefecto: !esperado, entorno: env({ X: valor }) })).toBe(esperado);
  });
});

describe("booleano · ausente usa el valor por defecto", () => {
  it.each([
    ["no definida", {}],
    ["cadena vacía", { X: "" }],
    ["solo espacios", { X: "   " }],
  ])("%s no es un error", (_caso, valores) => {
    // Ausente es distinto de mal escrita: no configurar algo opcional es legítimo.
    expect(
      booleano("X", { porDefecto: true, entorno: env(valores as Record<string, string>) }),
    ).toBe(true);
    expect(
      booleano("X", { porDefecto: false, entorno: env(valores as Record<string, string>) }),
    ).toBe(false);
  });
});

describe("booleano · FALLA EN VOZ ALTA ante un valor inválido", () => {
  it.each(["1", "0", "yes", "no", "si", "sí", "on", "off", "verdadero", "tru", "TRUE!", "y", "n"])(
    "%s lanza en vez de caer a false en silencio",
    (valor) => {
      // Este es el punto entero: si "si" se tratara como false, la verificación
      // de email quedaría desactivada y el despliegue arrancaría verde.
      expect(() => booleano("X", { porDefecto: false, entorno: env({ X: valor }) })).toThrow(
        ErrorConfiguracion,
      );
    },
  );

  it("el mensaje dice qué variable, qué valor y qué se admite", () => {
    let capturado: unknown;
    try {
      booleano("AUTH_REQUIRE_EMAIL_VERIFICATION", {
        porDefecto: false,
        entorno: env({ AUTH_REQUIRE_EMAIL_VERIFICATION: "si" }),
      });
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorConfiguracion);
    const e = capturado as ErrorConfiguracion;
    expect(e.variable).toBe("AUTH_REQUIRE_EMAIL_VERIFICATION");
    expect(e.message).toContain('"si"');
    expect(e.message).toContain('"true"');
    expect(e.message).toContain('"false"');
  });

  it("un valor inválido lanza aunque el valor por defecto sea true", () => {
    // No se cae al defecto: si está escrito, tiene que estar bien escrito.
    expect(() => booleano("X", { porDefecto: true, entorno: env({ X: "quizá" }) })).toThrow(
      ErrorConfiguracion,
    );
  });
});

describe("seExigeVerificacionEmail", () => {
  it("por defecto está desactivado", () => {
    expect(seExigeVerificacionEmail(env({}))).toBe(false);
  });

  it("se activa con true", () => {
    expect(seExigeVerificacionEmail(env({ AUTH_REQUIRE_EMAIL_VERIFICATION: "true" }))).toBe(true);
  });

  it("una errata revienta en vez de dejar el control apagado", () => {
    expect(() => seExigeVerificacionEmail(env({ AUTH_REQUIRE_EMAIL_VERIFICATION: "si" }))).toThrow(
      ErrorConfiguracion,
    );
  });
});

describe("validarEntorno · recoge TODOS los problemas de una vez", () => {
  it("un entorno vacío es válido: todo tiene valor por defecto", () => {
    expect(() => validarEntorno(env({}))).not.toThrow();
  });

  it("un entorno correcto pasa", () => {
    expect(() =>
      validarEntorno(
        env({
          AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
          DRIVE_MIRROR_ENABLED: "false",
          RATE_LIMIT_ENABLED: "true",
        }),
      ),
    ).not.toThrow();
  });

  it("informa de las TRES erratas a la vez, no solo de la primera", () => {
    // Quien despliega prefiere una lista de tres erratas a tres despliegues
    // fallidos seguidos.
    let capturado: unknown;
    try {
      validarEntorno(
        env({
          AUTH_REQUIRE_EMAIL_VERIFICATION: "si",
          DRIVE_MIRROR_ENABLED: "1",
          RATE_LIMIT_ENABLED: "on",
        }),
      );
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorConfiguracion);
    const mensaje = (capturado as ErrorConfiguracion).message;
    expect(mensaje).toContain("AUTH_REQUIRE_EMAIL_VERIFICATION");
    expect(mensaje).toContain("DRIVE_MIRROR_ENABLED");
    expect(mensaje).toContain("RATE_LIMIT_ENABLED");
    expect(mensaje).toContain("(3)");
  });

  it("cada bandera declarada tiene descripción y valor por defecto", () => {
    for (const b of BANDERAS) {
      expect(b.variable).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(typeof b.porDefecto).toBe("boolean");
      expect(b.descripcion.length).toBeGreaterThan(0);
    }
  });

  it("el rate limiting viene activado por defecto", () => {
    // Un límite que hay que acordarse de encender no es un límite.
    const rl = BANDERAS.find((b) => b.variable === "RATE_LIMIT_ENABLED");
    expect(rl?.porDefecto).toBe(true);
  });
});

describe("textoObligatorio", () => {
  it("devuelve el valor recortado", () => {
    expect(textoObligatorio("X", { entorno: env({ X: "  hola  " }) })).toBe("hola");
  });

  it.each([
    ["ausente", {}],
    ["vacía", { X: "" }],
    ["solo espacios", { X: "   " }],
  ])("%s lanza", (_caso, valores) => {
    expect(() =>
      textoObligatorio("X", { entorno: env(valores as Record<string, string>) }),
    ).toThrow(ErrorConfiguracion);
  });

  it("incluye la pista en el mensaje si se da", () => {
    try {
      textoObligatorio("DATABASE_URL", {
        entorno: env({}),
        pista: "Sale de Neon → Connection Details.",
      });
      throw new Error("debería haber lanzado");
    } catch (error) {
      expect((error as Error).message).toContain("Neon");
    }
  });
});

describe("textoOpcional", () => {
  it.each([
    ["ausente", {}, undefined],
    ["vacía", { X: "" }, undefined],
    ["solo espacios", { X: "  " }, undefined],
    ["con valor", { X: " v " }, "v"],
  ])("%s", (_caso, valores, esperado) => {
    expect(textoOpcional("X", env(valores as Record<string, string>))).toBe(esperado);
  });
});

describe("entero", () => {
  it("usa el valor por defecto si falta", () => {
    expect(entero("X", { porDefecto: 5, entorno: env({}) })).toBe(5);
  });

  it("lee un entero válido", () => {
    expect(entero("X", { porDefecto: 5, entorno: env({ X: "42" }) })).toBe(42);
  });

  it.each(["10abc", "abc", "1.5", "-1", "", " "])("rechaza %s en vez de tolerarlo", (valor) => {
    // parseInt("10abc") devuelve 10 en silencio: justo la tolerancia a evitar.
    const resultado = () => entero("X", { porDefecto: 5, minimo: 1, entorno: env({ X: valor }) });
    if (valor.trim() === "") {
      expect(resultado()).toBe(5); // vacío = ausente
    } else {
      expect(resultado).toThrow(ErrorConfiguracion);
    }
  });
});
