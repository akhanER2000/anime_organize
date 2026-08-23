import { describe, expect, it } from "vitest";

import { MENSAJES, MENSAJES_QUE_NO_PUEDEN_DIVERGIR } from "./mensajes";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADO POR MUTACIÓN (2026-08-23) — `.claude/rules/testing.md`
 *
 * Mutación: cambiar `loginFallido` por «No existe ninguna cuenta con ese correo»
 * (que es exactamente el mensaje "útil" que la usabilidad pide y la seguridad
 * prohíbe).
 *
 * Resultado MEDIDO: **3 tests en rojo**
 *   · «ningún texto contiene una frase delatora»
 *   · «el mensaje de login orienta sin decir qué ha fallado»
 *   · «el mensaje de login menciona la trampa de copiar y pegar»
 * Restaurado y verde (17/17).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Frases que confirman o niegan la existencia de una cuenta. */
const DELATORAS = [
  /\bno existe\b/i,
  /\bno hay ninguna cuenta\b/i,
  /\bese correo no\b/i,
  /\bya (existe|est[áa] registrad)/i,
  /\bcuenta no encontrada\b/i,
  /\busuario no encontrado\b/i,
  /\bcontrase[ñn]a (es )?(incorrecta|err[óo]nea|inv[áa]lida)\b/i,
  /\bcorreo (es )?(incorrecto|err[óo]neo)\b/i,
  /\bcuenta (est[áa] )?(desactivada|bloqueada|suspendida)\b/i,
  /\bno est[áa] verificad/i,
];

/** Todos los textos, aplanados, para poder barrerlos. */
function todosLosTextos(): { ruta: string; texto: string }[] {
  const salida: { ruta: string; texto: string }[] = [];

  const recorrer = (valor: unknown, ruta: string): void => {
    if (typeof valor === "string") {
      salida.push({ ruta, texto: valor });
      return;
    }
    if (typeof valor === "object" && valor !== null) {
      for (const [clave, hijo] of Object.entries(valor)) {
        recorrer(hijo, ruta === "" ? clave : `${ruta}.${clave}`);
      }
    }
  };

  recorrer(MENSAJES, "");
  return salida;
}

describe("NINGÚN MENSAJE CONFIRMA NI NIEGA QUE UNA CUENTA EXISTA", () => {
  it("ningún texto contiene una frase delatora", () => {
    const delatores: { ruta: string; texto: string; patron: string }[] = [];

    for (const { ruta, texto } of todosLosTextos()) {
      for (const patron of DELATORAS) {
        if (patron.test(texto)) {
          delatores.push({ ruta, texto, patron: patron.source });
        }
      }
    }

    expect(delatores, `mensajes que delatan:\n${JSON.stringify(delatores, null, 2)}`).toEqual([]);
  });

  it("el mensaje de login orienta sin decir qué ha fallado", () => {
    const m = MENSAJES.loginFallido;

    // Lo que SÍ tiene: cosas concretas que revisar.
    expect(m).toMatch(/revisa/i);
    expect(m).toMatch(/correo/i);
    expect(m).toMatch(/contraseña/i);
    // Y la pista que resuelve el caso real más frecuente.
    expect(m).toMatch(/verificaci[óo]n|verificar/i);

    // Lo que NO tiene: cuál de las dos cosas está mal.
    expect(m).not.toMatch(/incorrect/i);
    expect(m).not.toMatch(/no existe/i);
  });

  it("el mensaje de login menciona la trampa de copiar y pegar", () => {
    // Es la causa real más común de un login fallido con credenciales buenas:
    // un espacio al final del email copiado del gestor de contraseñas.
    expect(MENSAJES.loginFallido).toMatch(/espacio|may[úu]scula/i);
  });
});

describe("LOS MENSAJES QUE NO PUEDEN DIVERGIR", () => {
  it.each(MENSAJES_QUE_NO_PUEDEN_DIVERGIR)("$motivo", ({ casos, mensaje }) => {
    // El mensaje es UNO para todos los casos del grupo. Si alguien "mejora" uno
    // y no el otro, la diferencia se convierte en el oráculo que evitábamos.
    expect(casos.length).toBeGreaterThan(1);
    expect(mensaje.length).toBeGreaterThan(0);
  });

  it("registro y recuperación usan el condicional «si…»", () => {
    // Es el recurso que permite ser informativo sin afirmar nada: la frase es
    // verdadera exista o no la cuenta.
    expect(MENSAJES.registroHecho).toMatch(/^Si /);
    expect(MENSAJES.recuperarEnviado).toMatch(/^Si /);
    expect(MENSAJES.reenvioHecho).toMatch(/^Si /);
  });
});

describe("USABILIDAD · el mensaje seguro tiene que servir de algo", () => {
  it("el login ofrece las TRES salidas a la vez", () => {
    // Que estén siempre las tres es lo que hace innecesario decir cuál es el
    // problema: la que te sirva, la usas.
    expect(MENSAJES.loginAcciones.recuperar).toBeTruthy();
    expect(MENSAJES.loginAcciones.reenviar).toBeTruthy();
    expect(MENSAJES.loginAcciones.registrarse).toBeTruthy();
  });

  it("los errores de CAMPO sí son concretos: no enumeran nada", () => {
    // Validar la forma del texto no dice nada sobre si la cuenta existe.
    expect(MENSAJES.campos.emailMalFormado).toMatch(/@/);
    expect(MENSAJES.campos.passwordCorta).toMatch(/8/);
    expect(MENSAJES.campos.passwordsNoCoinciden).toMatch(/coinciden/);
  });

  it("el rate limit sí puede ser concreto", () => {
    // «Demasiados intentos» no revela nada de la cuenta.
    expect(MENSAJES.loginDemasiadosIntentos).toMatch(/demasiados intentos/i);
    expect(MENSAJES.loginDemasiadosIntentos).toMatch(/espera/i);
  });

  it("el registro sin correo ofrece la salida del atasco", () => {
    expect(MENSAJES.registroSinCorreo).toMatch(/reenv/i);
    expect(MENSAJES.registroSinCorreo).toMatch(/creada/i);
  });

  it("el borrado avisa de que se descarga una copia antes", () => {
    expect(MENSAJES.borrarExportPrimero).toMatch(/copia|JSON/i);
    expect(MENSAJES.borrarConfirmacion).toMatch(/no se puede deshacer/i);
  });
});

describe("TONO · segunda persona, sin regañar", () => {
  it("ningún mensaje lleva signos de exclamación", () => {
    const conExclamacion = todosLosTextos().filter((m) => /[!¡]/.test(m.texto));
    expect(conExclamacion).toEqual([]);
  });

  it("ningún mensaje culpa al usuario", () => {
    const culpables = todosLosTextos().filter((m) =>
      /\b(has fallado|error tuyo|te has equivocado|mal escrito)\b/i.test(m.texto),
    );
    expect(culpables).toEqual([]);
  });

  it("ningún mensaje usa jerga técnica ni códigos", () => {
    const jerga = todosLosTextos().filter((m) =>
      /\b(token|hash|null|undefined|4\d\d|5\d\d|JWT|payload)\b/.test(m.texto),
    );
    expect(jerga, `con jerga: ${JSON.stringify(jerga)}`).toEqual([]);
  });

  it("todos los mensajes acaban en punto", () => {
    const sinPunto = todosLosTextos()
      .filter((m) => !m.ruta.startsWith("loginAcciones"))
      .filter((m) => !m.texto.trimEnd().endsWith("."));

    expect(sinPunto, `sin punto final: ${JSON.stringify(sinPunto.map((m) => m.ruta))}`).toEqual([]);
  });

  it("las acciones son etiquetas de botón, sin punto", () => {
    for (const etiqueta of Object.values(MENSAJES.loginAcciones)) {
      expect(etiqueta.endsWith(".")).toBe(false);
    }
  });
});
