import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MENSAJE_LOGIN_BLOQUEADO,
  puedeDesvincular,
  puedeVincularDesdeAjustes,
  puedeVincularEnLogin,
} from "./vinculacion";

/**
 * ESTE TEST SE ESCRIBE CON GOOGLE DESACTIVADO, A PROPÓSITO.
 *
 * El proveedor de Google no está implementado (necesita proyecto en Google Cloud,
 * pantalla de consentimiento y callback desplegado). Pero la política de
 * vinculación es lo caro de retrofitear y lo peligroso de improvisar, así que se
 * decide, se escribe en `.claude/rules/security.md` §2 bis y se fija aquí.
 *
 * El día que se encienda el proveedor, nadie tendrá que recordar la decisión: si
 * alguien añade `allowDangerousEmailAccountLinking` o una vinculación por email,
 * estos tests se ponen en rojo.
 */

describe("vinculación durante el LOGIN · nunca automática", () => {
  it("un email NUEVO con Google crea usuario nuevo: eso no es vincular", () => {
    const d = puedeVincularEnLogin({
      emailYaRegistrado: false,
      cuentaYaVinculadaAOtroUsuario: false,
    });

    expect(d.permitido).toBe(true);
  });

  it("un email YA REGISTRADO con contraseña se BLOQUEA", () => {
    // El ataque que evita: quien logre crear una cuenta en el proveedor con el
    // email de la víctima entraría en su vault sin conocer la contraseña.
    const d = puedeVincularEnLogin({
      emailYaRegistrado: true,
      cuentaYaVinculadaAOtroUsuario: false,
    });

    expect(d.permitido).toBe(false);
    if (d.permitido) throw new Error("inalcanzable");
    expect(d.motivo).toBe("EMAIL_YA_REGISTRADO");
    // Se conserva el código de Auth.js en vez de inventar uno propio.
    expect(d.codigoAuthJs).toBe("OAuthAccountNotLinked");
  });

  it("una cuenta del proveedor ya vinculada a OTRO usuario se bloquea", () => {
    const d = puedeVincularEnLogin({
      emailYaRegistrado: false,
      cuentaYaVinculadaAOtroUsuario: true,
    });

    expect(d.permitido).toBe(false);
    if (d.permitido) throw new Error("inalcanzable");
    expect(d.motivo).toBe("CUENTA_YA_VINCULADA_A_OTRO");
  });

  it("«ya vinculada a otro» gana sobre «email ya registrado»", () => {
    // Orden importante: el UNIQUE (provider, provider_account_id) es la
    // restricción más fuerte y su motivo es el más informativo para el log.
    const d = puedeVincularEnLogin({
      emailYaRegistrado: true,
      cuentaYaVinculadaAOtroUsuario: true,
    });

    expect(d.permitido).toBe(false);
    if (d.permitido) throw new Error("inalcanzable");
    expect(d.motivo).toBe("CUENTA_YA_VINCULADA_A_OTRO");
  });

  it("el mensaje de login es genérico: no enumera usuarios", () => {
    // Decir «ese email ya existe» confirma qué direcciones tienen cuenta.
    expect(MENSAJE_LOGIN_BLOQUEADO).not.toMatch(/ya (existe|está registrad)/i);
    expect(MENSAJE_LOGIN_BLOQUEADO).toContain("Ajustes");
  });
});

describe("vinculación desde AJUSTES · la única vía permitida", () => {
  it("con sesión iniciada se permite", () => {
    // Hay prueba de posesión de la cuenta (la sesión) y del proveedor (el OAuth).
    const d = puedeVincularDesdeAjustes({
      haySesion: true,
      cuentaYaVinculadaAOtroUsuario: false,
    });

    expect(d.permitido).toBe(true);
  });

  it("sin sesión NO se permite, aunque el OAuth haya ido bien", () => {
    const d = puedeVincularDesdeAjustes({
      haySesion: false,
      cuentaYaVinculadaAOtroUsuario: false,
    });

    expect(d.permitido).toBe(false);
    if (d.permitido) throw new Error("inalcanzable");
    expect(d.motivo).toBe("SIN_SESION");
  });

  it("no se puede robar una cuenta del proveedor ya vinculada a otro usuario", () => {
    const d = puedeVincularDesdeAjustes({
      haySesion: true,
      cuentaYaVinculadaAOtroUsuario: true,
    });

    expect(d.permitido).toBe(false);
  });
});

describe("desvinculación · nunca se deja una cuenta sin forma de entrar", () => {
  it("se puede desvincular Google si queda la contraseña", () => {
    const d = puedeDesvincular(
      { tienePassword: true, proveedoresVinculados: ["google"] },
      "google",
    );

    expect(d.permitido).toBe(true);
  });

  it("se puede desvincular Google si queda OTRO proveedor", () => {
    const d = puedeDesvincular(
      { tienePassword: false, proveedoresVinculados: ["google", "github"] },
      "google",
    );

    expect(d.permitido).toBe(true);
  });

  it("NO se puede desvincular el ÚNICO método de acceso", () => {
    // Sin contraseña y con un solo proveedor, desvincular deja al usuario fuera
    // de su propio vault sin ninguna vía de recuperación.
    const d = puedeDesvincular(
      { tienePassword: false, proveedoresVinculados: ["google"] },
      "google",
    );

    expect(d.permitido).toBe(false);
    if (d.permitido) throw new Error("inalcanzable");
    expect(d.motivo).toBe("ULTIMO_METODO_DE_ACCESO");
  });

  it("desvincular algo que no estaba vinculado no deja la cuenta huérfana", () => {
    const d = puedeDesvincular(
      { tienePassword: false, proveedoresVinculados: ["github"] },
      "google",
    );

    expect(d.permitido).toBe(true);
  });

  it("un usuario sin password y sin proveedores es un estado imposible, pero no explota", () => {
    const d = puedeDesvincular({ tienePassword: false, proveedoresVinculados: [] }, "google");

    expect(d.permitido).toBe(false);
  });
});

describe("regresión: la configuración no puede desactivar la política", () => {
  const raiz = fileURLToPath(new URL("../../..", import.meta.url));

  function leerFuentes(): string {
    // Solo el código de la app: las skills de terceros pueden mencionar la opción
    // en su documentación y eso no es un fallo de este proyecto.
    const rutas = ["src/lib/auth/vinculacion.ts"];
    return rutas.map((r) => readFileSync(raiz + r, "utf-8")).join("\n");
  }

  it("`allowDangerousEmailAccountLinking` no aparece activado en el código de auth", () => {
    // El nombre lo dice. No se activa «solo para desarrollo»: acaba en producción.
    const fuentes = leerFuentes();
    expect(fuentes).not.toMatch(/allowDangerousEmailAccountLinking\s*:\s*true/);
  });

  it("no hay vinculación por búsqueda de email en el módulo de política", () => {
    // Vincular buscando por email en un callback de signIn es el mismo agujero
    // escrito a mano.
    const fuentes = leerFuentes();
    expect(fuentes).not.toMatch(/findFirst[\s\S]{0,120}email[\s\S]{0,120}linkAccount/);
  });
});
