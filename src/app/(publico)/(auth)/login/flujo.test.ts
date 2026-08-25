import { describe, expect, it, vi } from "vitest";

import { MENSAJES, mensajeLoginFallido } from "@/lib/auth/mensajes";

import { ejecutarLogin, hayErrorEnUrl, type DependenciasLogin } from "./flujo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ PROTEGE ESTE FICHERO
 *
 * 1. Que el rate limit va ANTES de `signIn` —y por tanto antes de Argon2id—.
 * 2. Que un formulario inválido no llega ni siquiera al limitador.
 * 3. Que el mensaje de fallo es el genérico de `mensajes.ts` y NO el del
 *    artboard («Contraseña incorrecta · te quedan 4 intentos»), que enumeraría
 *    cuentas.
 *
 * ── VERIFICADO POR MUTACIÓN (2026-08-23) · `.claude/rules/testing.md` ──────
 * Mutación aplicada: mover la llamada a `deps.comprobarLimite` DESPUÉS de
 * `deps.autenticar` en `ejecutarLogin` (el orden ingenuo, el que convierte el
 * login en un amplificador de DoS).
 *
 * Resultado MEDIDO: **2 tests en rojo** (17 → 2 failed | 15 passed)
 *   · «una petición bloqueada NUNCA llega a autenticar»
 *   · «el orden real de las llamadas es límite → autenticar»
 * Restaurado y verde (17/17).
 *
 * Y el que NO se pone rojo, que también dice algo: «cuando el límite bloquea,
 * el mensaje es el del limitador» sigue verde con la mutación puesta, porque
 * comprueba el TEXTO y no el orden. Comprobar el mensaje no protege del DoS:
 * lo que protege es la afirmación de que `autenticar` recibe cero llamadas.
 *
 * Segunda mutación: ignorar el resultado de `autenticar` y devolver siempre
 * `{ ok: true }` → **4 tests en rojo** (17 → 4 failed | 13 passed): los cuatro
 * del bloque «EL MENSAJE DE FALLO NO ENUMERA CUENTAS». Restaurado y verde
 * (17/17).
 *
 * ── LO QUE ESTE FICHERO **NO** DEMUESTRA ──────────────────────────────────
 * Que la protección esté ENCHUFADA. Aquí las dependencias son `vi.fn()`: se
 * comprueba la lógica del orden, no que `acciones.ts` cablee el limitador de
 * verdad ni que `signIn` acabe en Argon2id. Eso es un test del CAMINO REAL
 * (testing.md § «Verificación por el CAMINO REAL»), que exige levantar
 * `next start` y Postgres. La tabla de estado de `testing.md` marca «Rate limit
 * antes del hash» como RECONSTRUIDO; esta pantalla no lo cambia, y así se dice
 * en SUPUESTOS.md.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ENTRADA = { email: "Rocio@Correo.com", password: "una-contrasena-cualquiera" };

function deps(sobrescribir: Partial<DependenciasLogin> = {}): DependenciasLogin {
  return {
    comprobarLimite: vi.fn().mockResolvedValue({ permitido: true }),
    autenticar: vi.fn().mockResolvedValue(true),
    seExigeVerificacion: vi.fn().mockReturnValue(false),
    ...sobrescribir,
  };
}

describe("EL RATE LIMIT VA ANTES DE AUTENTICAR", () => {
  it("una petición bloqueada NUNCA llega a autenticar", async () => {
    // ESTE ES EL TEST QUE IMPORTA. `autenticar` acaba en `signIn` → `authorize`
    // → Argon2id: 19 MiB y decenas de ms de CPU que se cobran por milisegundo.
    const d = deps({ comprobarLimite: vi.fn().mockResolvedValue({ permitido: false }) });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta.ok).toBe(false);
    expect(d.autenticar).not.toHaveBeenCalled();
  });

  it("el orden real de las llamadas es límite → autenticar", async () => {
    const orden: string[] = [];
    const d = deps({
      comprobarLimite: vi.fn(async () => {
        orden.push("limite");
        return { permitido: true };
      }),
      autenticar: vi.fn(async () => {
        orden.push("autenticar");
        return true;
      }),
    });

    await ejecutarLogin(ENTRADA, d);

    expect(orden).toEqual(["limite", "autenticar"]);
  });

  it("cuando el límite bloquea, el mensaje es el del limitador", async () => {
    const d = deps({ comprobarLimite: vi.fn().mockResolvedValue({ permitido: false }) });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta).toEqual({
      ok: false,
      error: { codigo: "LIMITE_EXCEDIDO", mensaje: MENSAJES.loginDemasiadosIntentos },
    });
  });

  it("el límite se comprueba también cuando las credenciales son correctas", async () => {
    const d = deps();

    await ejecutarLogin(ENTRADA, d);

    expect(d.comprobarLimite).toHaveBeenCalledOnce();
  });

  it("el limitador recibe el email NORMALIZADO por el esquema", async () => {
    // La clave del cubo se calcula sobre este valor. Sin normalizar,
    // `Rocio@Correo.com` y `rocio@correo.com` serían dos cubos distintos y el
    // límite por cuenta se saltaría cambiando las mayúsculas (security.md §5).
    const d = deps();

    await ejecutarLogin(ENTRADA, d);

    expect(d.comprobarLimite).toHaveBeenCalledWith({ email: "rocio@correo.com" });
  });
});

describe("VALIDACIÓN ANTES QUE NADA", () => {
  it("un correo mal formado no llega ni al limitador ni a autenticar", async () => {
    const d = deps();

    const respuesta = await ejecutarLogin({ email: "esto-no-es-un-correo", password: "x" }, d);

    expect(respuesta.ok).toBe(false);
    expect(d.comprobarLimite).not.toHaveBeenCalled();
    expect(d.autenticar).not.toHaveBeenCalled();
  });

  it("señala el campo que falla, para que el formulario lo pinte donde toca", async () => {
    const d = deps();

    const respuesta = await ejecutarLogin({ email: "rocio@correo.com", password: "" }, d);

    expect(respuesta).toEqual({
      ok: false,
      error: {
        codigo: "VALIDACION",
        mensaje: "Escribe tu contraseña",
        detalles: [{ campo: "password", motivo: "Escribe tu contraseña" }],
      },
    });
  });

  it("una entrada que no es ni un objeto se rechaza sin tocar nada", async () => {
    // Lo que llega a una Server Action es lo que mande el navegador: puede ser
    // cualquier cosa, incluido `null`.
    const d = deps();

    const respuesta = await ejecutarLogin(null, d);

    expect(respuesta.ok).toBe(false);
    expect(d.comprobarLimite).not.toHaveBeenCalled();
  });

  it("recordarme es opcional: sin marcarlo, el login sigue funcionando", async () => {
    const d = deps();

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta).toEqual({ ok: true });
  });
});

describe("EL MENSAJE DE FALLO NO ENUMERA CUENTAS", () => {
  it("credenciales malas devuelven el texto genérico de mensajes.ts", async () => {
    // El artboard dice «Contraseña incorrecta · te quedan 4 intentos». Ese
    // texto confirma que el correo existe Y que hay una cuenta contando
    // intentos: security.md §2 gana al PNG. Ver SUPUESTOS.md.
    const d = deps({ autenticar: vi.fn().mockResolvedValue(false) });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta).toEqual({
      ok: false,
      error: { codigo: "NO_AUTENTICADO", mensaje: mensajeLoginFallido(false) },
    });
  });

  it("el mensaje NO menciona la contraseña ni cuántos intentos quedan", async () => {
    const d = deps({ autenticar: vi.fn().mockResolvedValue(false) });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    // Se afirma el fallo ANTES de mirar el texto. Sin esta línea, una versión
    // que dejara entrar a cualquiera pasaría el test con el mensaje vacío: un
    // test que no puede fallar por un bug real es deuda, no cobertura.
    expect(respuesta.ok).toBe(false);

    const mensaje = respuesta.ok ? "" : respuesta.error.mensaje.toLowerCase();

    expect(mensaje).not.toContain("incorrecta");
    expect(mensaje).not.toContain("intentos");
    expect(mensaje).not.toContain("no existe");
  });

  it("con la verificación de email activa, añade la pista y nada más", async () => {
    // Depende de una bandera GLOBAL, no de la cuenta: no informa de ninguna
    // dirección concreta. Ver `mensajeLoginFallido`.
    const d = deps({
      autenticar: vi.fn().mockResolvedValue(false),
      seExigeVerificacion: vi.fn().mockReturnValue(true),
    });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta.ok).toBe(false);
    if (!respuesta.ok) {
      expect(respuesta.error.mensaje).toBe(mensajeLoginFallido(true));
      expect(respuesta.error.mensaje).toContain(MENSAJES.loginFallidoBase);
    }
  });

  it("el fallo de credenciales NO se atribuye a ningún campo", async () => {
    // Marcar «Contraseña» en rojo diría «el correo está bien», que es el mismo
    // oráculo con otra forma.
    const d = deps({ autenticar: vi.fn().mockResolvedValue(false) });

    const respuesta = await ejecutarLogin(ENTRADA, d);

    expect(respuesta.ok).toBe(false);
    if (!respuesta.ok) {
      expect(respuesta.error.detalles).toBeUndefined();
    }
  });
});

describe("hayErrorEnUrl · el cinturón además de los tirantes", () => {
  it("detecta el error que Auth.js pondría en el query", () => {
    expect(hayErrorEnUrl("/login?error=CredentialsSignin")).toBe(true);
  });

  it("una URL absoluta con error también cuenta", () => {
    expect(hayErrorEnUrl("https://vault.test/login?error=Configuration")).toBe(true);
  });

  it("una redirección limpia no es un error", () => {
    expect(hayErrorEnUrl("http://localhost:3000/api/auth/callback/credentials")).toBe(false);
  });

  it("lo que no sea una cadena no puede afirmarse como error", () => {
    expect(hayErrorEnUrl(undefined)).toBe(false);
    expect(hayErrorEnUrl(null)).toBe(false);
    expect(hayErrorEnUrl(42)).toBe(false);
  });
});
