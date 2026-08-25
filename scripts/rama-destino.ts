/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECIR EN VOZ ALTA CONTRA QUÉ BASE SE VA A ESCRIBIR.
 *
 * ── POR QUÉ EXISTE ESTO ───────────────────────────────────────────────────
 *
 * `migrate` y `seed` escriben, y la cadena de conexión llega por una variable
 * de entorno que puede venir de `.env.local` o de la línea de comandos. Las dos
 * ramas de Neon —`development` y `production`— se parecen lo suficiente como
 * para confundirlas, y **sembrar la equivocada no tiene deshacer**.
 *
 * El caso concreto que esto previene: se prepara el despliegue, se pasa la
 * cadena de producción en línea para migrar, y en el comando siguiente se
 * olvida — así que el seed cae en `development` y parece que todo fue bien
 * hasta que la aplicación desplegada aparece vacía. O al revés, que es peor.
 *
 * ── LO QUE SE IMPRIME NO ES LA CADENA ─────────────────────────────────────
 *
 * Solo el HOST y el nombre de la base. La contraseña va dentro de la URL y
 * estos scripts se ejecutan con la salida a la vista, a veces compartida en una
 * captura o pegada en una conversación. Un script que imprime su propia
 * credencial la convierte en pública sin que nadie lo decida.
 *
 * En Neon el host lleva el nombre de la rama —`ep-…-pooler.<region>.aws…`— y no
 * siempre es legible, así que además se marca lo que sí se puede afirmar: si la
 * cadena viene del entorno o de un fichero.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El host y la base de una cadena de conexión, sin credenciales. */
export function describirDestino(cadena: string): string {
  try {
    const url = new URL(cadena);
    const base = url.pathname.replace(/^\//, "");

    return `${url.hostname}${base === "" ? "" : ` · base "${base}"`}`;
  } catch {
    // Una cadena ilegible se dice tal cual —sin imprimirla—: quien la pasó
    // necesita saber que no se pudo leer, no ver el error del parser.
    return "(cadena de conexión ilegible)";
  }
}

/**
 * Imprime el destino antes de escribir nada.
 *
 * `origen` distingue lo que se pasó en línea de lo que salió de `.env.local`,
 * que es justo la confusión que hay que evitar al operar contra producción.
 */
export function anunciarDestino(
  cadena: string,
  opciones: { variable: string; pasadaEnLinea: boolean },
): void {
  const procedencia = opciones.pasadaEnLinea
    ? "pasada en la línea de comandos"
    : "leída de un fichero .env";

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  DESTINO: ${describirDestino(cadena)}`);
  console.log(`  ${opciones.variable}, ${procedencia}`);
  console.log(`${"═".repeat(70)}`);
}
