import { vinoDelEntorno } from "./cargar-entorno";

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
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  DESTINO: ${describirDestino(cadena)}`);
  console.log(`  ${opciones.variable}, ${procedencia(opciones.pasadaEnLinea)}`);

  // ── Y LA OTRA VARIABLE TAMBIÉN, SIEMPRE ─────────────────────────────────
  //
  // Anunciar solo la que este script usa es lo que dejó pasar el fallo número
  // 6: la línea decía la verdad sobre `DATABASE_URL` mientras `db:verificar` y
  // las transacciones leían `DATABASE_URL_UNPOOLED` de `.env.local`, que
  // apuntaba a otra rama. El anuncio era correcto y el destino de media
  // operación, no.
  //
  // `exigirMismaRama()` ya impide que apunten a ramas distintas. Esto es la
  // otra mitad: **enseñar de dónde salió cada una**, para que quien mire la
  // salida pueda comprobar con los ojos que las dos vinieron de la línea de
  // comandos y ninguna de un fichero.
  const otra = opciones.variable === "DATABASE_URL" ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";
  const suValor = process.env[otra];

  if (suValor === undefined || suValor === "") {
    console.log(`  ${otra}, sin definir`);
  } else {
    console.log(`  ${otra}: ${describirDestino(suValor)}`);
    console.log(`  ${otra}, ${procedencia(vinoDelEntorno(otra))}`);
  }

  console.log(`${"═".repeat(70)}`);
}

function procedencia(pasadaEnLinea: boolean): string {
  return pasadaEnLinea ? "pasada en la línea de comandos" : "leída de un fichero .env";
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOS VARIABLES, DOS RAMAS: SE PARA.
 *
 * ── EL FALLO QUE ESTO CIERRA, Y ES LA SEXTA VEZ ───────────────────────────
 *
 * Los scripts no leen todos la misma variable. `dbInterna()` —la que usan el
 * seed y la aplicación— lee `DATABASE_URL`. `conTransaccion()` y
 * `verificar-esquema` leen `DATABASE_URL_UNPOOLED` **con preferencia**.
 *
 * Al operar contra producción se pasa la cadena en línea. Si se pasa **solo
 * una** de las dos, la otra sigue valiendo lo que dice `.env.local`, que apunta
 * a `development`. Resultado: la mitad del comando actúa sobre producción y la
 * otra mitad sobre desarrollo, y **el anuncio de destino dice la verdad sobre
 * la variable que anuncia** — así que todo parece correcto.
 *
 * Fue exactamente esto: `db:verificar` dijo «esquema verificado: todo correcto»
 * sobre `development` mientras se creía estar mirando `production`, y el
 * recuento de «83 animes, 83 portadas» que se dio por bueno salió de la rama
 * equivocada. La aplicación desplegada quedó apuntando a una base sin datos y
 * nadie lo supo hasta abrirla.
 *
 * ── POR QUÉ SE PARA EN VEZ DE AVISAR ──────────────────────────────────────
 *
 * `security.md` regla 5: la configuración falla en voz alta. Un aviso en medio
 * de la salida de un seed que imprime 83 líneas no lo lee nadie. Y la operación
 * que sigue escribe: si se equivoca de rama, no hay deshacer.
 *
 * Que las dos apunten al MISMO host es lo normal —es lo que hay en `.env.local`
 * y lo que hay en Vercel—, así que esta guarda no molesta nunca salvo cuando
 * está a punto de pasar el fallo que previene.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function exigirMismaRama(
  // Estructural y no `NodeJS.ProcessEnv`: lo único que se necesita son dos
  // claves, y exigir el tipo completo obligaría a cada test a inventarse un
  // `NODE_ENV` que no tiene nada que ver con lo que se comprueba.
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const agrupada = entorno["DATABASE_URL"];
  const directa = entorno["DATABASE_URL_UNPOOLED"];

  // Sin la segunda no hay dos ramas posibles: quien la lee cae en la primera.
  if (agrupada === undefined || directa === undefined) return;

  const hostDe = (cadena: string): string | null => {
    try {
      // El sufijo `-pooler` es lo ÚNICO que distingue la cadena agrupada de la
      // directa de la misma rama de Neon. Compararlas sin quitarlo daría un
      // falso positivo en el caso normal, y una guarda que salta siempre se
      // desactiva a la semana.
      return new URL(cadena).hostname.replace("-pooler", "");
    } catch {
      return null;
    }
  };

  const unaRama = hostDe(agrupada);
  const otraRama = hostDe(directa);

  if (unaRama === null || otraRama === null || unaRama === otraRama) return;

  throw new Error(
    "\n" +
      "═".repeat(70) +
      "\n  DOS RAMAS A LA VEZ. No se escribe nada.\n\n" +
      `  DATABASE_URL           → ${unaRama}\n` +
      `  DATABASE_URL_UNPOOLED  → ${otraRama}\n\n` +
      "  Los scripts no leen todos la misma: `seed` usa la primera y\n" +
      "  `db:verificar` y las transacciones prefieren la segunda. Con dos\n" +
      "  ramas distintas, media operación cae en cada una y el resumen final\n" +
      "  parece correcto.\n\n" +
      "  Pasa LAS DOS en la línea de comandos, o ninguna.\n" +
      "═".repeat(70) +
      "\n",
  );
}
