/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSTANTES DE «RECUPERAR ACCESO».
 *
 * Módulo PURO: sin `server-only`, sin React, sin entorno. Lo importan el
 * servidor (`flujo.ts`, `acciones.ts`) y el navegador (`formulario.tsx`), y ese
 * es justamente el motivo de que exista.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * CADUCIDAD DEL ENLACE DE UN SOLO USO — **una hora**.
 *
 * ── EL ARTBOARD DICE 15 MINUTOS Y AQUÍ GANA LA REGLA ──────────────────────
 * `design/screens/07-auth.png` rotula «Caduca en 15 minutos».
 * `.claude/rules/security.md` §2 fija **1 hora** para los tokens de un solo
 * uso; el esquema de `password_reset_tokens` lo repite en su cabecera y
 * `plantillaReset` escribe «1 hora» en el correo. Tres sitios contra uno, y
 * además `CLAUDE.md` § «El diseño manda» da autoridad VISUAL al artboard, no
 * autoridad sobre una regla de seguridad. Anotado en `SUPUESTOS.md`.
 *
 * ── Y POR QUÉ ES UNA CONSTANTE Y NO UN NÚMERO ESCRITO EN EL TEXTO ─────────
 * Porque el día que alguien cambie la caducidad del token y no el literal de
 * la pantalla, **la interfaz mentirá** — y mentirá en la dirección peor: el
 * usuario creerá que le queda una hora cuando el enlace ya murió. El número
 * que se enseña sale de aquí y de ningún otro sitio.
 *
 * COSTURA PENDIENTE: cuando exista el orquestador de servidor (ver `emision.ts`),
 * esta constante debe MUDARSE a `src/lib/auth/` y ser la que use el `INSERT` en
 * `password_reset_tokens`. Mientras viva aquí, el backend todavía no la lee: es
 * la única copia, pero no la comparte nadie. Ver `SUPUESTOS.md` § «Caducidad».
 */
export const CADUCIDAD_ENLACE_MS = 60 * 60 * 1000;

/** Lo mismo, en minutos, que es la unidad con la que habla la card. */
export const CADUCIDAD_ENLACE_MINUTOS = CADUCIDAD_ENLACE_MS / 60_000;

/**
 * Cuánto dura la cuenta atrás del botón de reenvío.
 *
 * ── ES COSMÉTICA. NO ES UN LÍMITE ─────────────────────────────────────────
 * El límite de verdad lo impone el servidor: `recuperar:email` permite 3 por
 * hora y `recuperar:ip` 10 por hora (`src/lib/rate-limit/politica.ts`).
 * Cualquiera con las herramientas de desarrollo abiertas pone este contador a
 * cero en dos segundos, y da igual: la petición número cuatro se corta en el
 * servidor de todos modos.
 *
 * Lo que hace este temporizador es evitar el doble clic honesto —el de quien
 * cree que no se ha enviado— y gastarle al usuario uno de sus tres intentos de
 * la hora por nada.
 *
 * El artboard congela el botón en «Reenviar en 0:42», que es un fotograma de
 * una cuenta atrás en marcha, no su valor inicial. 60 s es el valor de partida
 * elegido; ver `SUPUESTOS.md`.
 */
export const SEGUNDOS_ANTES_DE_REENVIAR = 60;

/**
 * Cuánto se le pide esperar al usuario cuando el limitador no responde.
 *
 * Solo se usa en el camino de «falla cerrado»: si la base no contesta, no hay
 * veredicto del que sacar los segundos reales.
 */
export const SEGUNDOS_ESPERA_POR_DEFECTO = 60;

/**
 * ── ESTE TEXTO DEBERÍA VIVIR EN `src/lib/auth/mensajes.ts` ────────────────
 *
 * Todos los demás textos de esta pantalla salen de `MENSAJES`. Este no puede:
 * `MENSAJES` no tiene entrada para «demasiados intentos» en RECUPERACIÓN, solo
 * `loginDemasiadosIntentos`, que termina con «Si no recuerdas la contraseña, es
 * más rápido restablecerla» — un consejo absurdo justo en la pantalla de
 * restablecer la contraseña.
 *
 * `mensajes.ts` es de solo lectura para esta pantalla, así que el texto se
 * queda aquí con su nombre completo y su motivo.
 *
 * TODO(recuperar): mover a `MENSAJES.recuperarDemasiadosIntentos` y borrar esta
 * constante. Es una copia, y las copias divergen.
 *
 * No enumera: el contador del limitador sube exista o no la cuenta, así que ver
 * este mensaje no dice nada sobre la dirección escrita.
 */
export const MENSAJE_DEMASIADOS_INTENTOS =
  "Demasiados intentos. Espera unos minutos antes de volver a pedir otro enlace.";

/**
 * Lo que se enseña cuando algo se rompe por dentro.
 *
 * Ni un stack, ni un hostname, ni el error del driver
 * (`api-conventions.md` § «Forma de la respuesta»).
 */
export const MENSAJE_ERROR_INTERNO =
  "No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.";
