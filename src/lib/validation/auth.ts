import { z } from "zod";

/**
 * ESQUEMAS DE AUTENTICACIÓN — compartidos entre cliente y servidor.
 *
 * ── POR QUÉ ESTÁN AQUÍ Y NO EN CADA PANTALLA ───────────────────────────────
 * Las tres pantallas del artboard 07 las escriben agentes distintos. Si cada
 * una define su propia regla de contraseña, en una semana el registro exige 8
 * caracteres, el reset exige 12 y el cambio desde ajustes no exige nada. Una
 * sola definición, tres consumidores.
 *
 * El cliente los usa con `zodResolver` **por UX**. El servidor los revalida
 * **por seguridad** y no se fía de lo que llegue (security.md §8).
 */

/**
 * `users.email` es `citext`, así que la base ya compara sin distinguir
 * mayúsculas. Aun así se normaliza aquí: la CLAVE DEL RATE LIMIT se calcula
 * sobre este valor, y sin normalizar, `A@B.com` y `a@b.com` serían dos cubos
 * distintos y el límite se saltaría escribiendo el correo con otra caja
 * (security.md §5).
 */
export const EsquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Escribe tu correo")
  .max(254, "Ese correo es demasiado largo")
  .email("Eso no parece un correo");

/**
 * MÍNIMO 12 CARACTERES, y sin exigir «una mayúscula y un símbolo».
 *
 * El requisito clásico de variedad produce `Passw0rd!` —que está en cualquier
 * diccionario de ataque— y rechaza `caballo grapa batería correcto`, que es
 * órdenes de magnitud más resistente. La longitud es lo que de verdad cuesta
 * romper, así que es lo único que se exige.
 *
 * El tope de 72 no es estético: **Argon2id no lo necesita, pero bcrypt trunca
 * silenciosamente a 72 bytes**, y `security.md` §2 documenta bcrypt como
 * fallback. Si algún día se activa ese fallback sin este tope, dos contraseñas
 * que difieran a partir del carácter 72 serían la misma y nadie se enteraría.
 * Se corta ahora, mientras cortar es gratis.
 */
export const EsquemaPassword = z
  .string()
  .min(12, "Mínimo 12 caracteres. Una frase larga es más segura que un críptico corto.")
  .max(72, "Máximo 72 caracteres");

/**
 * El nombre visible. Opcional: el vault funciona sin él.
 *
 * ── `.nullish()` Y NO `.optional()`, Y NO ES UN DETALLE ────────────────────
 *
 * Este esquema TRANSFORMA: lo que entra es `string | null | undefined` y lo que
 * sale es `string | null`. Y el mismo esquema se usa **en los dos lados de la
 * red**: el cliente valida con él, manda al servidor lo que le salió, y el
 * servidor revalida con él.
 *
 * Con `.optional()`, ese viaje de ida y vuelta **no cerraba**:
 *
 *     cliente:  "" ──validar──▶ null ──enviar──▶ servidor
 *     servidor: null ──validar──▶ ✗ «Invalid input: expected string, received null»
 *
 * Resultado: **todo registro que dejara el nombre en blanco fallaba**, que es el
 * caso normal — el campo es opcional—. El formulario marcaba «Nombre» en rojo
 * con un mensaje que no significaba nada para quien lo leía.
 *
 * No lo vio el typecheck (los tipos de entrada y salida eran correctos por
 * separado), ni el lint, ni los 499 tests de unidad, ni la revisión de
 * seguridad, ni el verificador de fidelidad visual. Lo vio **un navegador
 * rellenando el formulario**, que es la única prueba que recorre el viaje
 * entero.
 *
 * Regla que se deriva, y que vale para cualquier esquema compartido: **si un
 * esquema se usa a los dos lados de la red y transforma, su ENTRADA tiene que
 * aceptar su propia SALIDA.** Si no, el segundo parseo rechaza lo que produjo el
 * primero. Está fijado con un test de ida y vuelta en `auth.test.ts`.
 */
export const EsquemaNombre = z
  .string()
  .trim()
  .max(80, "Máximo 80 caracteres")
  .nullish()
  .transform((v) => (v === undefined || v === null || v.length === 0 ? null : v));

export const EsquemaLogin = z.object({
  email: EsquemaEmail,
  // En LOGIN no se aplica `EsquemaPassword`: una contraseña antigua puede ser
  // más corta que el mínimo actual, y rechazarla en el cliente dejaría fuera a
  // su dueño legítimo. Aquí solo se comprueba que no esté vacía.
  password: z.string().min(1, "Escribe tu contraseña"),
  recordarme: z.boolean().default(false),
});

export const EsquemaRegistro = z.object({
  nombre: EsquemaNombre,
  email: EsquemaEmail,
  password: EsquemaPassword,
});

export const EsquemaRecuperar = z.object({
  email: EsquemaEmail,
});

export const EsquemaNuevaPassword = z.object({
  token: z.string().min(1),
  password: EsquemaPassword,
});

export type DatosLogin = z.infer<typeof EsquemaLogin>;
export type DatosRegistro = z.infer<typeof EsquemaRegistro>;
export type DatosRecuperar = z.infer<typeof EsquemaRecuperar>;
export type DatosNuevaPassword = z.infer<typeof EsquemaNuevaPassword>;

/**
 * ── LOS MENSAJES NO ESTÁN AQUÍ, Y ES IMPORTANTE ────────────────────────────
 *
 * Viven en `src/lib/auth/mensajes.ts`, que ya los tenía y además tiene el test
 * `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` vigilando que no se separen. Al escribir
 * este fichero llegué a duplicarlos aquí —«por comodidad»— y eso es exactamente
 * la deriva que el proyecto intenta impedir: dos copias que empiezan iguales y
 * un día dejan de serlo, y la que revela la existencia de una cuenta es la que
 * nadie estaba mirando.
 *
 * Úsalos siempre desde su origen:
 *
 *     import { MENSAJES, mensajeLoginFallido, accionesLogin } from "@/lib/auth/mensajes";
 *
 * Y `mensajeLoginFallido(seExigeVerificacion)` en vez de `MENSAJES.loginFallidoBase`
 * a pelo: la pista de verificación solo debe aparecer si esa verificación existe.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAMBIAR LA CONTRASEÑA CON SESIÓN INICIADA — Ajustes, artboard 09.
 *
 * ── LA ACTUAL **NO** PASA POR `EsquemaPassword`, Y ES A PROPÓSITO ─────────
 *
 * Es el mismo motivo por el que el login tampoco lo aplica: una contraseña
 * antigua puede ser más corta que el mínimo de hoy. Exigirle 12 caracteres a
 * la que ya tiene el usuario le impediría **cambiarla**, que es justo lo que
 * está intentando hacer, y con un mensaje que le diría que su contraseña actual
 * es inválida.
 *
 * La nueva sí lo pasa: para eso existe el mínimo.
 *
 * ── Y NO PUEDE SER LA MISMA ──────────────────────────────────────────────
 *
 * No es una regla de higiene: cambiar la contraseña **revoca las demás
 * sesiones**, así que alguien que la «cambie» por la misma creería haber echado
 * al intruso cuando lo único que ha hecho es renovar el reloj. La comprobación
 * es de igualdad exacta, sin normalizar: si difieren en un espacio, son
 * distintas para el hash y también aquí.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const EsquemaCambiarPassword = z
  .object({
    actual: z
      .string({ error: "Escribe tu contraseña actual" })
      .min(1, "Escribe tu contraseña actual"),
    nueva: EsquemaPassword,
  })
  .refine((datos) => datos.actual !== datos.nueva, {
    error: "La nueva tiene que ser distinta de la actual.",
    path: ["nueva"],
  });

export type DatosCambiarPassword = z.output<typeof EsquemaCambiarPassword>;
