import { describe, expect, it, vi } from "vitest";

import { calcularEspera, enviarConReintentos } from "@/lib/email/reintentos";
import { clasificarEstadoHttp, type ResultadoEnvio } from "@/lib/email/tipos";

import {
  MENSAJE_REGISTRO,
  accionAnteEmailExistente,
  decidirSiguientePaso,
  puedeReenviarVerificacion,
} from "./registro";

const OK: ResultadoEnvio = { ok: true, driver: "resend" };
const TEMPORAL: ResultadoEnvio = { ok: false, driver: "resend", motivo: "TEMPORAL", estado: 429 };
const PERMANENTE: ResultadoEnvio = { ok: false, driver: "resend", motivo: "PERMANENTE", estado: 422 };

/** Nada de esperas reales: el test no debe tardar segundos. */
const sinDormir = { dormir: () => Promise.resolve(), aleatorio: () => 1 };

describe("clasificación de errores del proveedor", () => {
  it.each([
    [429, "TEMPORAL"],
    [500, "TEMPORAL"],
    [502, "TEMPORAL"],
    [503, "TEMPORAL"],
  ])("%i es temporal: reintentar tiene sentido", (estado, esperado) => {
    expect(clasificarEstadoHttp(estado)).toBe(esperado);
  });

  it.each([
    [400, "PERMANENTE"],
    [401, "PERMANENTE"],
    [403, "PERMANENTE"],
    [422, "PERMANENTE"],
  ])("%i es permanente: reintentarlo solo hace esperar al usuario", (estado, esperado) => {
    expect(clasificarEstadoHttp(estado)).toBe(esperado);
  });
});

describe("reintentos · 429 y 5xx", () => {
  it("reintenta un 429 y acierta al segundo intento", () => {
    const enviar = vi.fn<() => Promise<ResultadoEnvio>>()
      .mockResolvedValueOnce(TEMPORAL)
      .mockResolvedValueOnce(OK);

    return enviarConReintentos(enviar, sinDormir).then((r) => {
      expect(r.resultado.ok).toBe(true);
      expect(r.intentosUsados).toBe(2);
      expect(enviar).toHaveBeenCalledTimes(2);
    });
  });

  it("agota los 3 intentos si el 5xx persiste", async () => {
    const enviar = vi.fn<() => Promise<ResultadoEnvio>>().mockResolvedValue({
      ok: false,
      driver: "resend",
      motivo: "TEMPORAL",
      estado: 503,
    });

    const r = await enviarConReintentos(enviar, sinDormir);

    expect(r.resultado.ok).toBe(false);
    expect(r.intentosUsados).toBe(3);
    expect(r.esperas).toHaveLength(2); // 3 intentos = 2 esperas entre ellos
  });

  it("NO reintenta un error permanente", async () => {
    // Un 422 por dirección inválida da igual cuántas veces se repita.
    const enviar = vi.fn<() => Promise<ResultadoEnvio>>().mockResolvedValue(PERMANENTE);

    const r = await enviarConReintentos(enviar, sinDormir);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r.intentosUsados).toBe(1);
    expect(r.esperas).toEqual([]);
  });

  it("no reintenta si el primero va bien", async () => {
    const enviar = vi.fn<() => Promise<ResultadoEnvio>>().mockResolvedValue(OK);

    const r = await enviarConReintentos(enviar, sinDormir);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r.esperas).toEqual([]);
  });
});

describe("retroceso exponencial con jitter", () => {
  it("el retraso crece exponencialmente", () => {
    const opciones = { baseMs: 300, topeMs: 10_000, aleatorio: () => 1 };

    expect(calcularEspera(0, opciones)).toBe(300);
    expect(calcularEspera(1, opciones)).toBe(600);
    expect(calcularEspera(2, opciones)).toBe(1200);
  });

  it("respeta el tope", () => {
    const opciones = { baseMs: 300, topeMs: 500, aleatorio: () => 1 };
    expect(calcularEspera(5, opciones)).toBe(500);
  });

  it("el jitter dispersa: con aleatorio bajo, la espera es menor", () => {
    // Si veinte registros fallan a la vez por un 5xx, reintentar todos
    // exactamente a los 300 ms recrea el pico que tumbó el servicio.
    const base = { baseMs: 300, topeMs: 10_000 };

    expect(calcularEspera(1, { ...base, aleatorio: () => 0 })).toBe(0);
    expect(calcularEspera(1, { ...base, aleatorio: () => 0.5 })).toBe(300);
    expect(calcularEspera(1, { ...base, aleatorio: () => 1 })).toBe(600);
  });

  it("las esperas totales se mantienen por debajo de ~3 s", async () => {
    // Esto corre dentro de la petición de registro, con el usuario mirando.
    const enviar = vi.fn<() => Promise<ResultadoEnvio>>().mockResolvedValue(TEMPORAL);

    const r = await enviarConReintentos(enviar, { dormir: () => Promise.resolve(), aleatorio: () => 1 });

    const total = r.esperas.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(3_000);
  });
});

describe("EL CAMINO QUE NO PUEDE QUEDAR ATASCADO", () => {
  it("si el correo falla, la cuenta se crea igual y se ofrece reenviar", () => {
    // Sin esto: cuenta creada, sin correo, y al reintentar el registro choca
    // contra el UNIQUE del email. El usuario no puede entrar ni registrarse.
    const paso = decidirSiguientePaso({ seExigeVerificacion: true, correoEnviado: false });

    expect(paso).toBe("REENVIAR_VERIFICACION");
  });

  it("si el correo sale, se pide revisar la bandeja", () => {
    expect(decidirSiguientePaso({ seExigeVerificacion: true, correoEnviado: true })).toBe(
      "REVISAR_CORREO",
    );
  });

  it.each([true, false])(
    "sin verificación obligatoria se entra directamente (correo enviado: %s)",
    (correoEnviado) => {
      // Con la bandera apagada el correo es informativo: que falle no bloquea.
      expect(decidirSiguientePaso({ seExigeVerificacion: false, correoEnviado })).toBe("ENTRAR");
    },
  );
});

describe("email ya existente · sin enumerar usuarios", () => {
  it("una cuenta nueva se crea", () => {
    expect(accionAnteEmailExistente({ existe: false, verificada: false })).toBe("CREAR");
  });

  it("una cuenta existente SIN verificar recibe otra verificación, no un error", () => {
    // Es justo el caso que desatasca al usuario del fallo de correo anterior.
    expect(accionAnteEmailExistente({ existe: true, verificada: false })).toBe(
      "REENVIAR_VERIFICACION",
    );
  });

  it("una cuenta ya verificada recibe un aviso, y NO se toca", () => {
    expect(accionAnteEmailExistente({ existe: true, verificada: true })).toBe(
      "AVISAR_YA_REGISTRADO",
    );
  });

  it("el mensaje al usuario es el mismo en los tres casos", () => {
    // Decir «esa cuenta existe pero no está verificada» confirma qué direcciones
    // están registradas.
    expect(MENSAJE_REGISTRO).toContain("Si la dirección es válida");
    expect(MENSAJE_REGISTRO).not.toMatch(/ya (existe|est[áa] registrad)/i);
    expect(MENSAJE_REGISTRO).not.toMatch(/no (existe|encontrad)/i);
  });
});

describe("reenvío de verificación", () => {
  it("se permite si la cuenta existe y no está verificada", () => {
    expect(puedeReenviarVerificacion({ existe: true, verificada: false, deletedAt: null })).toBe(
      true,
    );
  });

  it("NO se permite si ya está verificada", () => {
    // Si no, el endpoint es un generador de correo gratuito hacia terceros.
    expect(puedeReenviarVerificacion({ existe: true, verificada: true, deletedAt: null })).toBe(
      false,
    );
  });

  it("NO se permite si la cuenta no existe", () => {
    expect(puedeReenviarVerificacion({ existe: false, verificada: false, deletedAt: null })).toBe(
      false,
    );
  });

  it("NO se permite sobre una cuenta desactivada", () => {
    expect(
      puedeReenviarVerificacion({ existe: true, verificada: false, deletedAt: new Date() }),
    ).toBe(false);
  });
});
