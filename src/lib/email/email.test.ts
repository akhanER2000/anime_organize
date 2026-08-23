import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plantillaReset, plantillaVerificacion, plantillaVinculacionBloqueada } from "./plantillas";

const ENTORNO = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
});

afterEach(() => {
  process.env = { ...ENTORNO };
  vi.restoreAllMocks();
});

describe("selección de driver · la clave NUNCA es obligatoria", () => {
  it("sin RESEND_API_KEY usa el driver de consola", async () => {
    const { obtenerDriverEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    expect(obtenerDriverEmail().nombre).toBe("consola");
  });

  it("con RESEND_API_KEY y EMAIL_FROM usa Resend", async () => {
    process.env.RESEND_API_KEY = "re_clave_de_prueba";
    process.env.EMAIL_FROM = "vault@ejemplo.test";

    const { obtenerDriverEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    expect(obtenerDriverEmail().nombre).toBe("resend");
  });

  it("con clave pero SIN remitente avisa y cae a consola en vez de romper", async () => {
    // Configuración a medias: es un error del operador, no un modo de trabajo.
    // Romper aquí tumbaría el registro de usuarios por una variable olvidada.
    process.env.RESEND_API_KEY = "re_clave_de_prueba";
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { obtenerDriverEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    expect(obtenerDriverEmail().nombre).toBe("consola");
    expect(aviso).toHaveBeenCalledOnce();
    expect(aviso.mock.calls[0]?.[0]).toContain("EMAIL_FROM");
  });

  it("una clave con solo espacios cuenta como ausente", async () => {
    process.env.RESEND_API_KEY = "   ";
    process.env.EMAIL_FROM = "vault@ejemplo.test";

    const { obtenerDriverEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    expect(obtenerDriverEmail().nombre).toBe("consola");
  });
});

describe("driver de consola", () => {
  it("informa ok: el correo llegó a su destino, que aquí es el log", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { enviarEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    const r = await enviarEmail({
      para: "yo@ejemplo.test",
      asunto: "Prueba",
      texto: "https://ejemplo.test/verificar?token=abc",
    });

    // Devolver `false` haría que la app enseñara un error de envío inexistente.
    expect(r.ok).toBe(true);
    expect(r.driver).toBe("consola");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("https://ejemplo.test/verificar?token=abc");
  });
});

describe("enviarEmail · un fallo de correo no tumba el flujo", () => {
  it("captura el error del proveedor y devuelve ok:false en vez de lanzar", async () => {
    process.env.RESEND_API_KEY = "re_clave_de_prueba";
    process.env.EMAIL_FROM = "vault@ejemplo.test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const { enviarEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    // El usuario ya está creado y el token ya está guardado: lo que procede es
    // ofrecerle reenviar, no un 500.
    const r = await enviarEmail({ para: "a@b.test", asunto: "x", texto: "y" });

    expect(r).toEqual({ ok: false, driver: "resend", motivo: "TEMPORAL" });
  });

  it("un 4xx del proveedor tampoco lanza, y se marca PERMANENTE", async () => {
    process.env.RESEND_API_KEY = "re_clave_de_prueba";
    process.env.EMAIL_FROM = "vault@ejemplo.test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({}) }),
    );

    const { enviarEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();

    const r = await enviarEmail({ para: "a@b.test", asunto: "x", texto: "y" });
    expect(r.ok).toBe(false);
    // 422 = direccion invalida: reintentarlo no lo arregla.
    if (r.ok) throw new Error("inalcanzable");
    expect(r.motivo).toBe("PERMANENTE");
  });

  it("no filtra la clave de API en el log de error", async () => {
    process.env.RESEND_API_KEY = "re_secreto_que_no_debe_salir";
    process.env.EMAIL_FROM = "vault@ejemplo.test";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );

    const { enviarEmail, reiniciarDriverEmail } = await import("./index");
    reiniciarDriverEmail();
    await enviarEmail({ para: "a@b.test", asunto: "x", texto: "y" });

    const todo = JSON.stringify(err.mock.calls);
    expect(todo).not.toContain("re_secreto_que_no_debe_salir");
  });
});

describe("plantillas", () => {
  it("el enlace de verificación lleva el token codificado en la URL", () => {
    const m = plantillaVerificacion({ urlBase: "https://vault.test", token: "a b/c+d" });

    expect(m.texto).toContain("https://vault.test/verificar?token=a%20b%2Fc%2Bd");
  });

  it("el enlace de reset apunta a la pantalla de contraseña nueva", () => {
    const m = plantillaReset({ urlBase: "https://vault.test", token: "tok123" });

    expect(m.texto).toContain("https://vault.test/recuperar/nueva?token=tok123");
    expect(m.texto).toContain("1 hora");
  });

  it.each([
    ["verificación", plantillaVerificacion({ urlBase: "https://v.test", token: "tok" })],
    ["reset", plantillaReset({ urlBase: "https://v.test", token: "tok" })],
  ])("el asunto de %s NUNCA lleva el token", (_caso, m) => {
    // Los asuntos acaban en notificaciones del móvil, previsualizaciones del
    // buzón y logs de servidores de correo intermedios.
    expect(m.asunto).not.toContain("tok");
  });

  it("el correo de reset tranquiliza a quien no lo pidió", () => {
    const m = plantillaReset({ urlBase: "https://v.test", token: "t" });
    expect(m.texto).toContain("tu contraseña");
    expect(m.texto.toLowerCase()).toContain("si no has pedido");
  });

  it("el aviso de vinculación bloqueada explica por qué y no concede nada", () => {
    const m = plantillaVinculacionBloqueada({ urlBase: "https://v.test" });

    expect(m.texto).toContain("No hemos vinculado nada");
    expect(m.texto).toContain("desde Ajustes");
    expect(m.texto).toContain("https://v.test/app/ajustes");
  });

  it("todas las plantillas traen texto plano no vacío", () => {
    const todas = [
      plantillaVerificacion({ urlBase: "https://v.test", token: "t" }),
      plantillaReset({ urlBase: "https://v.test", token: "t" }),
      plantillaVinculacionBloqueada({ urlBase: "https://v.test" }),
    ];
    for (const m of todas) {
      expect(m.texto.trim().length).toBeGreaterThan(0);
      expect(m.asunto.trim().length).toBeGreaterThan(0);
    }
  });
});
