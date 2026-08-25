import { MENSAJES } from "@/lib/auth/mensajes";
import { accionAnteEmailExistente, decidirSiguientePaso } from "@/lib/auth/registro";
import { EsquemaPassword } from "@/lib/validation/auth";

import type { SiguientePaso } from "@/lib/auth/registro";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORQUESTACIÓN DEL REGISTRO — módulo PURO.
 *
 * Vive aquí, y no dentro de `acciones.ts`, por dos motivos:
 *
 *  1. Un fichero con `"use server"` solo puede exportar funciones async. Ni
 *     tipos, ni constantes, ni funciones puras. Un test no podría importar
 *     nada de él.
 *  2. Vitest corre con `environment: "node"` y **no transforma `.tsx`**. La
 *     lógica que merece test tiene que vivir en un `.ts` sin JSX.
 *
 * Es el mismo patrón que `src/lib/auth/login.ts`: las dependencias se inyectan,
 * así que el ORDEN se puede afirmar en un test —«el hash no llegó a llamarse»—
 * sin base de datos, sin Argon2 real y sin Auth.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ───────────────────────────────────────────────────────────────────────────
// TEXTOS DERIVADOS DEL ESQUEMA
// ───────────────────────────────────────────────────────────────────────────

/**
 * El artboard 07 pinta «Mínimo 8 caracteres» en el placeholder de contraseña.
 * `EsquemaPassword` exige **12**, y lo razona en su propio fichero: la longitud
 * es lo que de verdad resiste, y por eso no se pide «una mayúscula y un
 * símbolo». **Gana el esquema.**
 *
 * Pero escribir «Mínimo 12 caracteres» a mano sería cambiar un número
 * desincronizado por otro: el día que alguien suba el mínimo a 14, el texto
 * seguiría diciendo 12 y nadie se enteraría hasta que un usuario se estrellara
 * contra un error que contradice lo que la pantalla le prometía.
 *
 * Así que el número **se lee del esquema**. No se puede desincronizar porque no
 * hay dos copias.
 */
function minimoDeCaracteres(): number {
  const minimo = EsquemaPassword.minLength;

  if (minimo === null) {
    // No es defensivo por gusto: si alguien quita el `.min()` del esquema, esto
    // avisa en el acto en vez de dejar la pantalla prometiendo un mínimo que ya
    // no se aplica. Un fallback silencioso (`?? 12`) sería justo la copia que
    // este módulo existe para evitar.
    throw new Error(
      "EsquemaPassword ya no declara una longitud mínima. " +
        "El texto de la pantalla de registro se deriva de ella: revisa " +
        "src/lib/validation/auth.ts antes de seguir.",
    );
  }

  return minimo;
}

/** Longitud mínima real, la que aplica el servidor. */
export const MINIMO_PASSWORD = minimoDeCaracteres();

/** Placeholder del campo de contraseña. El del artboard, con el número correcto. */
export const PLACEHOLDER_PASSWORD = `Mínimo ${MINIMO_PASSWORD} caracteres`;

/**
 * Ayuda bajo el campo.
 *
 * NO repite la cifra: el placeholder ya la dice, y repetirla dos veces a cuatro
 * píxeles de distancia es ruido. Lo que añade es el POR QUÉ, que es lo que hace
 * que alguien elija una frase larga en vez de ocho caracteres crípticos.
 *
 * Además cubre un hueco de accesibilidad: `design-tokens.md` permite que el
 * placeholder vaya en `--ash-inactivo` —que no llega a 4.5:1— **solo porque no
 * porta información que no esté en la etiqueta**. Con esta ayuda visible, esa
 * condición se cumple de verdad.
 */
export const AYUDA_PASSWORD = "Una frase larga es más segura que un críptico corto.";

/** Placeholder del campo de nombre, tal cual el artboard. */
export const PLACEHOLDER_NOMBRE = "Cómo quieres que te llame";

/**
 * Lo que se responde mientras la costura del alta siga sin resolver.
 *
 * **NO es `MENSAJES.registroHecho`**, y esa es toda la intención: decirle a
 * alguien «te hemos enviado un correo» cuando no se ha creado nada ni se ha
 * enviado nada lo dejaría esperando en la bandeja de entrada un correo que no
 * va a llegar nunca. Un fallo visible se arregla; uno silencioso se descubre en
 * producción.
 *
 * Tampoco filtra nada: no dice qué falta ni menciona la base de datos.
 * Ver `acciones.ts`, bloque «PERSISTENCIA», y SUPUESTOS.md §1.
 */
export const MENSAJE_REGISTRO_NO_DISPONIBLE =
  "Ahora mismo no podemos crear cuentas nuevas. Vuelve a intentarlo en un rato.";

/**
 * Texto del límite de intentos.
 *
 * ── AQUÍ SÍ SE PUEDE SER CONCRETO ─────────────────────────────────────────
 * El límite del registro es **por IP**, nunca por dirección de correo, así que
 * este mensaje no dice nada sobre ninguna cuenta: solo sobre cuántas veces ha
 * pulsado quien está delante. Es el mismo criterio que
 * `MENSAJES.loginDemasiadosIntentos`, que también es explícito.
 *
 * No hay constante equivalente en `@/lib/auth/mensajes` —las de allí son de
 * login— y el minutaje sale del veredicto del limitador, así que se compone.
 */
export function mensajeLimiteExcedido(reintentarEnSegundos: number): string {
  const minutos = Math.max(1, Math.ceil(reintentarEnSegundos / 60));
  const cuando = minutos === 1 ? "un minuto" : `${minutos} minutos`;

  return `Demasiados intentos desde esta conexión. Prueba otra vez dentro de ${cuando}.`;
}

// ───────────────────────────────────────────────────────────────────────────
// ESTADO QUE VE EL FORMULARIO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lo que la Server Action devuelve al formulario.
 *
 * Es el mismo sobre discriminado que `api-conventions.md` pide para las
 * respuestas JSON, adaptado a una Server Action: **no se lanza al cliente**,
 * para que el formulario pueda pintar el resultado sin un `try/catch` dentro
 * del componente.
 */
export type EstadoRegistro =
  /** Nada enviado todavía. El valor inicial de `useActionState`/`useState`. */
  | { estado: "INICIAL" }
  /** Aceptado. `mensaje` es idéntico exista o no la cuenta. */
  | { estado: "OK"; mensaje: string }
  /** Zod rechazó algún campo. `{ campo: mensaje }`, un mensaje por campo. */
  | { estado: "VALIDACION"; errores: Record<string, string> }
  | { estado: "LIMITE_EXCEDIDO"; reintentarEnSegundos: number }
  /** Fallo del que el usuario no tiene la culpa. Nunca lleva detalles internos. */
  | { estado: "ERROR"; mensaje: string };

// ───────────────────────────────────────────────────────────────────────────
// LA ORQUESTACIÓN
// ───────────────────────────────────────────────────────────────────────────

/** Lo que la acción necesita saber hacer. Todo inyectable, nada importado. */
export type DependenciasRegistro = {
  /**
   * Comprueba el límite. **Lo PRIMERO**, y devuelve el veredicto sin haber
   * tocado la tabla de usuarios ni Argon2id.
   */
  comprobarLimite: () => Promise<{ permitido: boolean; reintentarEnSegundos: number }>;

  /** Estado de la cuenta con ese correo. `null` si no hay ninguna. */
  buscarCuenta: (email: string) => Promise<{ verificada: boolean } | null>;

  /** Argon2id. CARO a propósito: 19 MiB y decenas de ms. */
  hashearPassword: (password: string) => Promise<string>;

  /**
   * Paga el mismo precio que el hash sin verificar nada.
   * Ver `consumirTiempoEquivalente` en `src/lib/auth/password.ts`.
   */
  consumirTiempoEquivalente: () => Promise<void>;

  /** Crea el usuario. Devuelve su id. */
  crearUsuario: (datos: {
    email: string;
    passwordHash: string;
    nombre: string | null;
  }) => Promise<{ userId: string }>;

  /** Envía el correo que toque. `true` si salió. Nunca lanza. */
  enviarCorreo: (destino: { email: string; tipo: TipoCorreoRegistro }) => Promise<boolean>;

  /** ¿`AUTH_REQUIRE_EMAIL_VERIFICATION` está encendida? */
  seExigeVerificacion: () => boolean;
};

/**
 * Qué correo se manda en cada rama.
 *
 * Los tres existen y los tres son útiles para su destinatario legítimo. Lo que
 * NO cambia entre ramas es lo que ve quien está delante del formulario.
 */
export type TipoCorreoRegistro =
  /** Cuenta recién creada: enlace de verificación. */
  | "VERIFICACION"
  /** La cuenta ya existía sin verificar: se le reenvía el mismo enlace. */
  | "REENVIO_VERIFICACION"
  /** La cuenta ya existía y estaba verificada: «ya tienes cuenta, entra». */
  | "YA_REGISTRADO";

export type ResultadoRegistro =
  | {
      estado: "OK";
      /** Idéntico en las tres ramas. Es la respuesta, no un detalle de pintura. */
      mensaje: string;
      /**
       * ── NO SE RAMIFICA SOBRE ESTO EN LA UI. Ver SUPUESTOS.md §3. ──────────
       * `decidirSiguientePaso` devuelve `"ENTRAR"` cuando la verificación de
       * email está apagada, que es el caso por defecto. Entrar automáticamente
       * solo es posible en la rama CREAR: en las otras dos no tenemos ninguna
       * prueba de que quien rellena el formulario sea el titular. Si la pantalla
       * entrara en un caso y no en el otro, **la propia navegación sería el
       * oráculo de enumeración** que el mensaje único evita.
       *
       * Se devuelve porque es información legítima para quien integre el paso
       * siguiente, no para que la card decida con ella.
       */
      siguientePaso: SiguientePaso;
    }
  | { estado: "LIMITE_EXCEDIDO"; reintentarEnSegundos: number };

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ORDEN NO ES NEGOCIABLE:  parsear → RATE LIMIT → hash / base
 *
 * Argon2id está diseñado para ser caro (19 MiB y decenas de ms). Si el límite
 * se comprobara después, el registro sería un **amplificador de denegación de
 * servicio**: peticiones baratísimas para el atacante, carísimas para la
 * función serverless, que además cobra por milisegundo de CPU.
 *
 * El parseo Zod ocurre antes, en `acciones.ts`: es aritmética de strings y hay
 * que tener el email normalizado para construir la clave del limitador.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Y EL REGISTRO NO DICE SI EL CORREO YA EXISTE. Ni con el texto, ni con un
 * error de campo, ni tardando menos.
 *
 * La política ya está decidida y testeada en `src/lib/auth/registro.ts`
 * (`accionAnteEmailExistente`). Aquí solo se ejecuta:
 *
 *   · cuenta nueva          → se crea y se envía la verificación
 *   · existe, sin verificar → NO se toca, se reenvía la verificación
 *   · existe y verificada   → NO se toca, se avisa por correo al titular
 *
 * En las dos ramas que no crean nada no se ejecuta Argon2id, así que sin más
 * cuidado responderían en microsegundos frente a las decenas de ms de la rama
 * que sí hashea. Eso es un oráculo cronometrable, así que esas dos ramas pagan
 * `consumirTiempoEquivalente()`.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function procesarRegistro(
  datos: { email: string; password: string; nombre: string | null },
  deps: DependenciasRegistro,
): Promise<ResultadoRegistro> {
  // ── 1. RATE LIMIT ──────────────────────────────────────────────────────
  // Lo primero que se toca. Una petición bloqueada NO llega al hash y ni
  // siquiera consulta al usuario.
  const limite = await deps.comprobarLimite();
  if (!limite.permitido) {
    return { estado: "LIMITE_EXCEDIDO", reintentarEnSegundos: limite.reintentarEnSegundos };
  }

  // ── 2. ¿Existe ya esa dirección? ───────────────────────────────────────
  const cuenta = await deps.buscarCuenta(datos.email);

  const accion = accionAnteEmailExistente({
    existe: cuenta !== null,
    verificada: cuenta?.verificada ?? false,
  });

  // ── 3. Lo que se hace por detrás, que SÍ cambia ────────────────────────
  const tipoCorreo = await ejecutarAccion(accion, datos, deps);

  // ── 4. El correo, siempre después de que la transacción haya cuajado ───
  // Que falle no borra la cuenta ni cambia lo que se responde: ver la cabecera
  // de `src/lib/auth/registro.ts`.
  const correoEnviado = await deps.enviarCorreo({ email: datos.email, tipo: tipoCorreo });

  return {
    estado: "OK",
    // Los dos textos son idénticos en las tres ramas, y el de fallo también.
    // `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` lo vigila con un test propio: el camino
    // de error es el que un atacante puede provocar a voluntad saturando el
    // rate limit del proveedor de correo, así que dejarlo distinguible anularía
    // la protección del camino feliz.
    mensaje: correoEnviado ? MENSAJES.registroHecho : MENSAJES.correoNoEnviado,
    siguientePaso: decidirSiguientePaso({
      seExigeVerificacion: deps.seExigeVerificacion(),
      correoEnviado,
    }),
  };
}

/**
 * Ejecuta la rama que corresponda y devuelve qué correo toca mandar.
 *
 * Separado para que se lea de un vistazo cuál de las tres ramas hashea y cuál
 * paga el tiempo equivalente. Es la parte que un cambio descuidado rompe.
 */
async function ejecutarAccion(
  accion: ReturnType<typeof accionAnteEmailExistente>,
  datos: { email: string; password: string; nombre: string | null },
  deps: DependenciasRegistro,
): Promise<TipoCorreoRegistro> {
  if (accion === "CREAR") {
    const passwordHash = await deps.hashearPassword(datos.password);
    await deps.crearUsuario({
      email: datos.email,
      passwordHash,
      nombre: datos.nombre,
    });
    return "VERIFICACION";
  }

  // Las dos ramas restantes NO tocan la cuenta de nadie —eso sería dejar que un
  // desconocido reescriba la contraseña de una cuenta ajena— y no ejecutan
  // Argon2id, así que pagan su equivalente para no delatar por tiempo.
  await deps.consumirTiempoEquivalente();

  return accion === "REENVIAR_VERIFICACION" ? "REENVIO_VERIFICACION" : "YA_REGISTRADO";
}
