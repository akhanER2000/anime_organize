import { describe, expect, it, vi } from "vitest";

import { MENSAJES } from "@/lib/auth/mensajes";
import { EsquemaPassword, EsquemaRegistro } from "@/lib/validation/auth";

import {
  AYUDA_PASSWORD,
  MINIMO_PASSWORD,
  PLACEHOLDER_PASSWORD,
  mensajeLimiteExcedido,
  procesarRegistro,
} from "./registro";

import type { DependenciasRegistro } from "./registro";
import type { Mock } from "vitest";

/**
 * Tests de la ORQUESTACIÓN del registro.
 *
 * Vitest corre con `environment: "node"` y no transforma `.tsx`, así que lo que
 * se testea es el `.ts` puro. La card, el medidor y los campos no se prueban
 * aquí: eso es Nivel 3 de `testing.md` («que Tailwind aplique una clase» no es
 * un test) y le toca al e2e y a `ui-fidelity-checker`.
 */

const DATOS = {
  email: "rocio@correo.com",
  password: "caballo grapa bateria correcto",
  nombre: "Rocío",
} as const;

/**
 * Las mismas dependencias, pero espiadas una a una.
 *
 * El tipo se DERIVA del contrato real: si mañana `DependenciasRegistro` gana o
 * pierde una dependencia, esto deja de compilar en vez de seguir probando una
 * forma antigua.
 */
type EspiasRegistro = {
  [K in keyof DependenciasRegistro]: Mock<DependenciasRegistro[K]>;
};

/**
 * Todo permite y todo va bien, salvo lo que cada test cambie a propósito.
 *
 * Cada test sobrescribe SOLO la dependencia cuyo comportamiento está probando,
 * para que lo que hace fallar el test se lea en una línea.
 */
function dependencias(sobrescribir: Partial<EspiasRegistro> = {}): EspiasRegistro {
  return {
    comprobarLimite: vi.fn(async () => ({ permitido: true, reintentarEnSegundos: 0 })),
    buscarCuenta: vi.fn(async () => null),
    hashearPassword: vi.fn(async () => "$argon2id$fingido"),
    consumirTiempoEquivalente: vi.fn(async () => {}),
    crearUsuario: vi.fn(async () => ({ userId: "uuid-fingido" })),
    enviarCorreo: vi.fn(async () => true),
    seExigeVerificacion: vi.fn(() => true),
    ...sobrescribir,
  };
}

describe("procesarRegistro · el orden: rate limit ANTES del hash y de la base", () => {
  /**
   * VERIFICADO POR MUTACIÓN (2026-08-23):
   *   En `procesarRegistro` se movió la comprobación del límite DESPUÉS de
   *   `buscarCuenta` y de `ejecutarAccion` → **1 test en ROJO de 26** (25
   *   verdes): «no toca la base ni el hash cuando el límite está agotado»,
   *   que saltó en `expect(deps.hashearPassword).toHaveBeenCalledTimes(0)`
   *   —«expected to be called +0 times, but got 1 times»—. Restaurado el
   *   orden: 26 en verde.
   *
   *   OJO A LO QUE ESTO ENSEÑA: el `toEqual(LIMITE_EXCEDIDO)` siguió pasando
   *   con la mutación puesta. Un test que solo comprobara el valor devuelto
   *   habría dado verde con el hash ejecutándose en cada petición bloqueada.
   *   Lo que detecta el fallo son los espías, no el resultado.
   *
   * QUÉ PROTEGE: Argon2id cuesta 19 MiB y decenas de ms por diseño. Si el
   * límite se comprobara después, cada petición rechazada seguiría pagando el
   * hash y el registro sería un amplificador de denegación de servicio contra
   * una función serverless que cobra por milisegundo de CPU.
   *
   * INSUMO RECONSTRUIDO, dicho en voz alta: las dependencias van inyectadas con
   * `vi.fn()`. Esto demuestra que la FUNCIÓN ordena bien, no que en producción
   * esté enchufada. La verificación por el CAMINO REAL —enviar el formulario de
   * verdad contra un servidor arrancado y ver el 429— no se puede escribir
   * todavía: la Server Action se para antes de crear el usuario (SUPUESTOS §1).
   */
  it("no toca la base ni el hash cuando el límite está agotado", async () => {
    const deps = dependencias({
      comprobarLimite: vi.fn(async () => ({ permitido: false, reintentarEnSegundos: 900 })),
    });

    const resultado = await procesarRegistro(DATOS, deps);

    expect(resultado).toEqual({ estado: "LIMITE_EXCEDIDO", reintentarEnSegundos: 900 });
    expect(deps.hashearPassword).toHaveBeenCalledTimes(0);
    expect(deps.buscarCuenta).toHaveBeenCalledTimes(0);
    expect(deps.crearUsuario).toHaveBeenCalledTimes(0);
    expect(deps.enviarCorreo).toHaveBeenCalledTimes(0);
  });

  it("el control positivo: con límite disponible SÍ hashea y SÍ crea", async () => {
    // Sin este test, una función que no hiciera absolutamente nada pasaría el
    // anterior. `testing.md`: «se comprueba también el positivo».
    const deps = dependencias();

    await procesarRegistro(DATOS, deps);

    expect(deps.hashearPassword).toHaveBeenCalledTimes(1);
    expect(deps.crearUsuario).toHaveBeenCalledTimes(1);
  });
});

describe("procesarRegistro · no se puede saber si el correo ya existe", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LA PROTECCIÓN MÁS IMPORTANTE DE ESTA PANTALLA, Y ESTÁ VERIFICADA.
   *
   * VERIFICADO POR MUTACIÓN (2026-08-23), dos formas del mismo agujero:
   *
   *   (b) EL ORÁCULO POR TEXTO. Se hizo que la respuesta delatara la cuenta:
   *       `mensaje: cuenta !== null ? "Ya tienes una cuenta con ese correo.
   *       Prueba a entrar." : (…)`.
   *       → **4 tests en ROJO de 26** (22 verdes): los dos casos con cuenta
   *         («existe sin verificar» y «existe y verificada») × los dos caminos
   *         (correo enviado y correo fallido). El caso «cuenta nueva» siguió
   *         verde, que es justo lo que hace visible la asimetría.
   *
   *   (c) EL ORÁCULO POR TIEMPO, que es el silencioso. Se quitó
   *       `await deps.consumirTiempoEquivalente()` de `ejecutarAccion`.
   *       → **1 test en ROJO de 26** (25 verdes): «las ramas que no hashean
   *         pagan el tiempo equivalente» (esperaba 1 llamada, recibió 0).
   *         Ni un solo mensaje cambió: sin este test, delatar por reloj habría
   *         pasado en verde.
   *
   *   (d) EL SECUESTRO. Se forzó la rama `CREAR` para todas las cuentas
   *       (`if (true)`), de modo que un registro pisara la contraseña de una
   *       cuenta ajena.
   *       → **4 tests en ROJO de 26** (22 verdes), encabezados por «una cuenta
   *         que ya existe NO se toca».
   *
   * En los tres casos se restauró y volvieron los 26 a verde.
   *
   * QUÉ PROTEGE: `security.md` §2 — «/registro, /login y /recuperar responden
   * con el mismo mensaje y en un tiempo comparable exista o no la cuenta».
   * ══════════════════════════════════════════════════════════════════════
   */
  const CASOS = [
    { nombre: "cuenta nueva", cuenta: null },
    { nombre: "existe sin verificar", cuenta: { verificada: false } },
    { nombre: "existe y verificada", cuenta: { verificada: true } },
  ] as const;

  it.each(CASOS)("responde el mismo mensaje: $nombre", async ({ cuenta }) => {
    const deps = dependencias({ buscarCuenta: vi.fn(async () => cuenta) });

    const resultado = await procesarRegistro(DATOS, deps);

    expect(resultado).toEqual({
      estado: "OK",
      mensaje: MENSAJES.registroHecho,
      siguientePaso: "REVISAR_CORREO",
    });
  });

  it.each(CASOS)(
    "y el mismo mensaje también cuando el correo falla: $nombre",
    async ({ cuenta }) => {
      // El camino de error es el que un atacante puede provocar a voluntad
      // saturando el rate limit del proveedor de correo. Si delatara, proteger
      // solo el camino feliz no protegería nada.
      const deps = dependencias({
        buscarCuenta: vi.fn(async () => cuenta),
        enviarCorreo: vi.fn(async () => false),
      });

      const resultado = await procesarRegistro(DATOS, deps);

      expect(resultado).toEqual({
        estado: "OK",
        mensaje: MENSAJES.correoNoEnviado,
        siguientePaso: "REENVIAR_VERIFICACION",
      });
    },
  );

  it("una cuenta que ya existe NO se toca: ni se hashea ni se sobrescribe", async () => {
    // Si el registro reescribiera la contraseña de una cuenta existente, sería
    // un secuestro de cuenta en un solo formulario.
    const deps = dependencias({
      buscarCuenta: vi.fn(async () => ({ verificada: true })),
    });

    await procesarRegistro(DATOS, deps);

    expect(deps.crearUsuario).toHaveBeenCalledTimes(0);
    expect(deps.hashearPassword).toHaveBeenCalledTimes(0);
  });

  it("las ramas que no hashean pagan el tiempo equivalente", async () => {
    /**
     * VERIFICADO POR MUTACIÓN (2026-08-23) — mutación (c) de la cabecera de
     * este `describe`: se quitó `await deps.consumirTiempoEquivalente()` de
     * `ejecutarAccion` → **1 test en ROJO de 26** (25 verdes), este mismo
     * («expected to be called 1 times, but got 0 times»). Restaurado.
     *
     * QUÉ PROTEGE la enumeración POR TIEMPO: sin esta llamada, la rama «la
     * cuenta ya existe» responde en microsegundos y la rama «cuenta nueva» en
     * las decenas de ms que cuesta Argon2id. Un atacante distingue direcciones
     * registradas **cronometrando**, sin leer un solo mensaje. Medido en
     * `security.md` §2: 0,0006 ms frente a ~30 ms, 60.000 veces más rápido.
     */
    const deps = dependencias({ buscarCuenta: vi.fn(async () => ({ verificada: false })) });

    await procesarRegistro(DATOS, deps);

    expect(deps.consumirTiempoEquivalente).toHaveBeenCalledTimes(1);
  });

  it("la rama que sí hashea NO paga dos veces", async () => {
    const deps = dependencias();

    await procesarRegistro(DATOS, deps);

    expect(deps.consumirTiempoEquivalente).toHaveBeenCalledTimes(0);
  });
});

describe("procesarRegistro · qué correo recibe cada uno", () => {
  // El mensaje en pantalla es el mismo; lo que se hace por detrás no. Los tres
  // destinatarios legítimos reciben un correo ÚTIL, y quien no sea el titular
  // no aprende nada porque no ve ninguno de los tres.
  it.each([
    { nombre: "cuenta nueva", cuenta: null, tipo: "VERIFICACION" },
    { nombre: "sin verificar", cuenta: { verificada: false }, tipo: "REENVIO_VERIFICACION" },
    { nombre: "ya verificada", cuenta: { verificada: true }, tipo: "YA_REGISTRADO" },
  ] as const)("$nombre → $tipo", async ({ cuenta, tipo }) => {
    const deps = dependencias({ buscarCuenta: vi.fn(async () => cuenta) });

    await procesarRegistro(DATOS, deps);

    expect(deps.enviarCorreo).toHaveBeenCalledWith({ email: DATOS.email, tipo });
  });

  it("el usuario se crea con el nombre y el hash, nunca con la contraseña en claro", async () => {
    const deps = dependencias();

    await procesarRegistro(DATOS, deps);

    expect(deps.crearUsuario).toHaveBeenCalledWith({
      email: DATOS.email,
      passwordHash: "$argon2id$fingido",
      nombre: "Rocío",
    });
    // Paranoia barata: que la contraseña en claro no viaje por accidente en el
    // objeto de alta. Es el dato que jamás puede llegar a la base.
    const [alta] = deps.crearUsuario.mock.calls[0] ?? [];
    expect(JSON.stringify(alta)).not.toContain(DATOS.password);
  });
});

describe("procesarRegistro · el siguiente paso sale de la política ya decidida", () => {
  it("sin verificación obligatoria, el siguiente paso es ENTRAR", async () => {
    const deps = dependencias({ seExigeVerificacion: vi.fn(() => false) });

    const resultado = await procesarRegistro(DATOS, deps);

    expect(resultado).toMatchObject({ estado: "OK", siguientePaso: "ENTRAR" });
  });

  it("con verificación obligatoria y correo enviado, REVISAR_CORREO", async () => {
    const resultado = await procesarRegistro(DATOS, dependencias());

    expect(resultado).toMatchObject({ estado: "OK", siguientePaso: "REVISAR_CORREO" });
  });
});

describe("los textos de la pantalla salen del esquema, no de una copia", () => {
  /**
   * EL CHOQUE, RESUELTO Y VIGILADO: el artboard 07 pinta «Mínimo 8 caracteres»
   * y `EsquemaPassword` exige 12. Gana el esquema, y el texto se DERIVA de él
   * para que no puedan volver a separarse.
   *
   * VERIFICADO POR MUTACIÓN (2026-08-23):
   *   Se sustituyó `PLACEHOLDER_PASSWORD` por el literal del PNG —«Mínimo 8
   *   caracteres»— en vez de derivarlo del esquema → **2 tests en ROJO de 26**
   *   (24 verdes): «el mínimo que se enseña es exactamente el que aplica el
   *   servidor» y «el placeholder ya NO dice 8». Restaurado: 26 en verde.
   *
   *   La mutación complementaria (bajar `EsquemaPassword` a `.min(10)` y ver
   *   caer el primer test) NO se ejecutó: `src/lib/validation/auth.ts` es de
   *   solo lectura para esta pantalla. Lo que sí queda fijado es la dirección
   *   que importa: el texto no puede adelantarse al esquema.
   */
  it("el mínimo que se enseña es exactamente el que aplica el servidor", () => {
    expect(MINIMO_PASSWORD).toBe(EsquemaPassword.minLength);
    expect(PLACEHOLDER_PASSWORD).toBe(`Mínimo ${EsquemaPassword.minLength} caracteres`);
  });

  it("el placeholder ya NO dice 8, que es lo que pinta el PNG", () => {
    expect(PLACEHOLDER_PASSWORD).not.toContain("8");
    expect(PLACEHOLDER_PASSWORD).toContain("12");
  });

  it("la ayuda no repite la cifra: el placeholder ya la dice", () => {
    expect(AYUDA_PASSWORD).not.toMatch(/\d/);
    expect(AYUDA_PASSWORD.length).toBeGreaterThan(0);
  });

  it("una contraseña de 11 caracteres la rechaza el esquema, no la pantalla", () => {
    const resultado = EsquemaRegistro.safeParse({
      email: DATOS.email,
      password: "x".repeat(MINIMO_PASSWORD - 1),
    });

    expect(resultado.success).toBe(false);
  });
});

describe("mensajeLimiteExcedido", () => {
  it.each([
    { segundos: 1, esperado: "un minuto" },
    { segundos: 60, esperado: "un minuto" },
    { segundos: 61, esperado: "2 minutos" },
    { segundos: 3600, esperado: "60 minutos" },
  ])("$segundos s → «$esperado»", ({ segundos, esperado }) => {
    expect(mensajeLimiteExcedido(segundos)).toContain(esperado);
  });

  it("no menciona la cuenta ni el correo: el límite del registro es por IP", () => {
    const mensaje = mensajeLimiteExcedido(900);

    expect(mensaje).not.toMatch(/correo|cuenta|registrad/i);
  });
});
