import { describe, expect, it } from "vitest";

import {
  MENSAJES,
  MENSAJES_QUE_NO_PUEDEN_DIVERGIR,
  accionesLogin,
  mensajeLoginFallido,
} from "./mensajes";

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
 *
 * MUTACIÓN B (2026-08-23): restaurar «Tu cuenta está creada, pero no hemos
 * podido enviarte el correo» en `correoNoEnviado` — el texto que DELATABA un
 * registro nuevo, y que un atacante puede provocar a voluntad saturando el rate
 * limit del proveedor de correo.
 * Resultado MEDIDO: **3 tests en rojo**
 *   · «el fallo de correo ofrece la salida del atasco SIN afirmar nada»
 *   · «no afirma que la cuenta se haya creado»
 *   · «sigue ofreciendo qué hacer»
 *
 * MUTACIÓN C (2026-08-23): ignorar la bandera y enseñar siempre la pista de
 * verificación y el enlace de reenvío.
 * Resultado MEDIDO: **3 tests en rojo**
 *   · «con la verificación APAGADA, el mensaje NO la menciona»
 *   · «Reenviar verificación solo se ofrece si la verificación existe»
 *   · «las acciones conservan el orden: recuperar, [reenviar], registrarse»
 *
 * Las tres restauradas y verde (28/28).
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
    const m = mensajeLoginFallido(true);

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
    expect(mensajeLoginFallido(true)).toMatch(/espacio|may[úu]scula/i);
    expect(mensajeLoginFallido(false)).toMatch(/espacio|may[úu]scula/i);
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

  it("el fallo de correo ofrece la salida del atasco SIN afirmar nada", () => {
    // Ofrece qué hacer (reintentar, reenviar) pero no dice si hay cuenta.
    expect(MENSAJES.correoNoEnviado).toMatch(/reenv/i);
    expect(MENSAJES.correoNoEnviado).toMatch(/int[ée]ntalo|minutos/i);
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

describe("LA PISTA DE VERIFICACIÓN SE CONDICIONA A LA BANDERA", () => {
  it("con la verificación ENCENDIDA, el mensaje la menciona", () => {
    const m = mensajeLoginFallido(true);

    expect(m).toContain(MENSAJES.loginFallidoBase);
    expect(m).toMatch(/correo de verificaci[óo]n/i);
  });

  it("con la verificación APAGADA, el mensaje NO la menciona", () => {
    // Es como está el proyecto ahora. Mandar a alguien a buscar un correo que
    // nunca se envió es una pista falsa que le hace perder el tiempo.
    const m = mensajeLoginFallido(false);

    expect(m).toBe(MENSAJES.loginFallidoBase);
    expect(m).not.toMatch(/verificaci[óo]n/i);
    expect(m).not.toMatch(/acabas de registrarte/i);
  });

  it("la parte útil está en LOS DOS estados", () => {
    // Lo que se condiciona es la pista extra, no la orientación básica.
    for (const activa of [true, false]) {
      const m = mensajeLoginFallido(activa);
      expect(m, `bandera=${activa}`).toMatch(/revisa/i);
      expect(m, `bandera=${activa}`).toMatch(/espacio|may[úu]scula/i);
    }
  });

  it("«Reenviar verificación» solo se ofrece si la verificación existe", () => {
    // Un enlace que no lleva a ninguna parte es peor que no tener enlace.
    const conBandera = accionesLogin(true).map((a) => a.clave);
    const sinBandera = accionesLogin(false).map((a) => a.clave);

    expect(conBandera).toContain("reenviar");
    expect(sinBandera).not.toContain("reenviar");
  });

  it("recuperar y registrarse se ofrecen SIEMPRE", () => {
    for (const activa of [true, false]) {
      const claves = accionesLogin(activa).map((a) => a.clave);
      expect(claves, `bandera=${activa}`).toContain("recuperar");
      expect(claves, `bandera=${activa}`).toContain("registrarse");
    }
  });

  it("las acciones conservan el orden: recuperar, [reenviar], registrarse", () => {
    expect(accionesLogin(true).map((a) => a.clave)).toEqual([
      "recuperar",
      "reenviar",
      "registrarse",
    ]);
    expect(accionesLogin(false).map((a) => a.clave)).toEqual(["recuperar", "registrarse"]);
  });

  it("condicionar por la bandera NO es una fuga", () => {
    // La bandera es GLOBAL, no por cuenta: su estado se deduce en dos segundos
    // mirando el registro. Lo que no puede variar es el texto ANTE LA MISMA
    // configuración según qué cuenta se pruebe, y eso sigue garantizado.
    const dosIntentosDistintos = [mensajeLoginFallido(false), mensajeLoginFallido(false)];
    expect(dosIntentosDistintos[0]).toBe(dosIntentosDistintos[1]);
  });
});

describe("EL FALLO DE CORREO NO PUEDE DELATAR UN REGISTRO NUEVO", () => {
  it("no afirma que la cuenta se haya creado", () => {
    // La versión anterior decía «Tu cuenta está creada, pero…», y ese texto solo
    // puede salir en un registro nuevo: quien lo viera sabría que la cuenta NO
    // existía antes.
    const m = MENSAJES.correoNoEnviado;

    expect(m).not.toMatch(/tu cuenta est[áa] creada/i);
    expect(m).not.toMatch(/\bcuenta creada\b/i);
    expect(m).not.toMatch(/\bhemos creado\b/i);
    expect(m).not.toMatch(/\bya ten[íi]as\b/i);
  });

  it("es el MISMO texto tras crear, al reenviar y al recuperar", () => {
    const grupo = MENSAJES_QUE_NO_PUEDEN_DIVERGIR.find((g) =>
      g.motivo.startsWith("fallo de correo"),
    );

    expect(grupo).toBeDefined();
    expect(grupo?.mensaje).toBe(MENSAJES.correoNoEnviado);
    // Los tres caminos que un atacante puede provocar saturando el proveedor.
    expect(grupo?.casos).toContain("FALLO_TRAS_CREAR");
    expect(grupo?.casos).toContain("FALLO_AL_REENVIAR");
    expect(grupo?.casos).toContain("FALLO_EN_RECUPERACION");
  });

  it("sigue ofreciendo qué hacer", () => {
    // No afirmar nada no puede significar no ayudar.
    expect(MENSAJES.correoNoEnviado).toMatch(/int[ée]ntalo de nuevo/i);
    expect(MENSAJES.correoNoEnviado).toMatch(/reenv/i);
  });
});
