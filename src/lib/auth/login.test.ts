import { describe, expect, it, vi } from "vitest";

import { intentarLogin, type DependenciasLogin } from "./login";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * Mutación: mover la comprobación de límite DESPUÉS de `verificarPassword` en
 * `intentarLogin` (que es el orden ingenuo y el que convierte el login en un
 * amplificador de DoS).
 *
 * Resultado MEDIDO: **3 tests en rojo**
 *   · «una petición bloqueada NUNCA llega a verificar la contraseña»
 *   · «una petición bloqueada tampoco consulta al usuario»
 *   · «el orden real de las llamadas es límite → usuario → hash»
 * Restaurado y verde (13/13).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const USUARIO = {
  id: "u-1",
  passwordHash: "$argon2id$hash-de-mentira",
  emailVerified: new Date("2026-01-01"),
  deletedAt: null,
};

function deps(sobrescribir: Partial<DependenciasLogin> = {}): DependenciasLogin {
  return {
    comprobarLimite: vi.fn().mockResolvedValue({ permitido: true, reintentarEnSegundos: 0 }),
    buscarUsuario: vi.fn().mockResolvedValue(USUARIO),
    verificarPassword: vi.fn().mockResolvedValue(true),
    seExigeVerificacion: vi.fn().mockReturnValue(false),
    ...sobrescribir,
  };
}

const CREDENCIALES = { email: "yo@ejemplo.test", password: "correcta" };

describe("EL RATE LIMIT VA ANTES DEL HASH", () => {
  it("una petición bloqueada NUNCA llega a verificar la contraseña", async () => {
    // ESTE ES EL TEST QUE IMPORTA. Argon2id consume 19 MiB y decenas de ms por
    // llamada: si el límite se comprobara después, el login sería un
    // amplificador de DoS —peticiones baratas para el atacante, carísimas para
    // la función serverless, que además cobra por milisegundo de CPU—.
    const d = deps({
      comprobarLimite: vi.fn().mockResolvedValue({ permitido: false, reintentarEnSegundos: 900 }),
    });

    const r = await intentarLogin(CREDENCIALES, d);

    expect(r).toEqual({ estado: "LIMITE_EXCEDIDO", reintentarEnSegundos: 900 });
    expect(d.verificarPassword).not.toHaveBeenCalled();
  });

  it("una petición bloqueada tampoco consulta al usuario", async () => {
    // Ni siquiera la consulta: bajo avalancha, cada búsqueda es una conexión a
    // Neon que se está gastando para nada.
    const d = deps({
      comprobarLimite: vi.fn().mockResolvedValue({ permitido: false, reintentarEnSegundos: 60 }),
    });

    await intentarLogin(CREDENCIALES, d);

    expect(d.buscarUsuario).not.toHaveBeenCalled();
  });

  it("el límite se comprueba SIEMPRE, incluso con credenciales correctas", async () => {
    const d = deps();
    await intentarLogin(CREDENCIALES, d);

    expect(d.comprobarLimite).toHaveBeenCalledOnce();
  });

  it("el orden real de las llamadas es límite → usuario → hash", async () => {
    const orden: string[] = [];
    const d = deps({
      comprobarLimite: vi.fn(async () => {
        orden.push("limite");
        return { permitido: true, reintentarEnSegundos: 0 };
      }),
      buscarUsuario: vi.fn(async () => {
        orden.push("usuario");
        return USUARIO;
      }),
      verificarPassword: vi.fn(async () => {
        orden.push("hash");
        return true;
      }),
    });

    await intentarLogin(CREDENCIALES, d);

    expect(orden).toEqual(["limite", "usuario", "hash"]);
  });
});

describe("el hash se ejecuta SIEMPRE, exista o no el usuario", () => {
  it("con un email inexistente también se llama a verificarPassword", async () => {
    // Es lo que iguala los tiempos: si se saltara, la respuesta volvería en
    // milisegundos y delataría que la cuenta no existe.
    const d = deps({ buscarUsuario: vi.fn().mockResolvedValue(null) });

    const r = await intentarLogin(CREDENCIALES, d);

    expect(d.verificarPassword).toHaveBeenCalledOnce();
    expect(d.verificarPassword).toHaveBeenCalledWith("correcta", null);
    expect(r).toEqual({ estado: "CREDENCIALES_INVALIDAS" });
  });

  it("con un usuario sin contraseña (solo OAuth) también", async () => {
    const d = deps({
      buscarUsuario: vi.fn().mockResolvedValue({ ...USUARIO, passwordHash: null }),
      verificarPassword: vi.fn().mockResolvedValue(false),
    });

    const r = await intentarLogin(CREDENCIALES, d);

    expect(d.verificarPassword).toHaveBeenCalledWith("correcta", null);
    expect(r.estado).toBe("CREDENCIALES_INVALIDAS");
  });
});

describe("resultados del login", () => {
  it("credenciales correctas devuelven OK", async () => {
    const r = await intentarLogin(CREDENCIALES, deps());
    expect(r).toEqual({ estado: "OK", userId: "u-1" });
  });

  it("contraseña incorrecta devuelve CREDENCIALES_INVALIDAS", async () => {
    const d = deps({ verificarPassword: vi.fn().mockResolvedValue(false) });
    expect(await intentarLogin(CREDENCIALES, d)).toEqual({ estado: "CREDENCIALES_INVALIDAS" });
  });

  it("una cuenta desactivada NO dice que está desactivada", async () => {
    // Decir «tu cuenta está desactivada» confirma que existe.
    const d = deps({
      buscarUsuario: vi.fn().mockResolvedValue({ ...USUARIO, deletedAt: new Date() }),
    });

    expect(await intentarLogin(CREDENCIALES, d)).toEqual({ estado: "CREDENCIALES_INVALIDAS" });
  });

  it("el resultado de usuario inexistente y contraseña mala es IDÉNTICO", async () => {
    // Ni un campo de diferencia: si el objeto difiere, el cliente lo distingue.
    const sinUsuario = await intentarLogin(
      CREDENCIALES,
      deps({ buscarUsuario: vi.fn().mockResolvedValue(null) }),
    );
    const malaPassword = await intentarLogin(
      CREDENCIALES,
      deps({ verificarPassword: vi.fn().mockResolvedValue(false) }),
    );

    expect(sinUsuario).toEqual(malaPassword);
  });
});

describe("verificación de email", () => {
  it("con la bandera apagada se entra aunque el email no esté verificado", async () => {
    const d = deps({
      buscarUsuario: vi.fn().mockResolvedValue({ ...USUARIO, emailVerified: null }),
      seExigeVerificacion: vi.fn().mockReturnValue(false),
    });

    expect(await intentarLogin(CREDENCIALES, d)).toEqual({ estado: "OK", userId: "u-1" });
  });

  it("con la bandera encendida se bloquea y se ofrece reenviar", async () => {
    const d = deps({
      buscarUsuario: vi.fn().mockResolvedValue({ ...USUARIO, emailVerified: null }),
      seExigeVerificacion: vi.fn().mockReturnValue(true),
    });

    expect(await intentarLogin(CREDENCIALES, d)).toEqual({
      estado: "EMAIL_SIN_VERIFICAR",
      userId: "u-1",
    });
  });

  it("EMAIL_SIN_VERIFICAR solo se alcanza ACERTANDO la contraseña", async () => {
    // Por eso no filtra nada: quien no sabe la contraseña nunca ve ese estado.
    const d = deps({
      buscarUsuario: vi.fn().mockResolvedValue({ ...USUARIO, emailVerified: null }),
      seExigeVerificacion: vi.fn().mockReturnValue(true),
      verificarPassword: vi.fn().mockResolvedValue(false),
    });

    expect(await intentarLogin(CREDENCIALES, d)).toEqual({ estado: "CREDENCIALES_INVALIDAS" });
  });
});
