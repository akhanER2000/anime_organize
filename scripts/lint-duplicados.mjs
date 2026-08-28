import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BARRIDO DE RECETAS DE CLASES DUPLICADAS.
 *
 * ── POR QUÉ ESTE SCRIPT EXISTE ────────────────────────────────────────────
 *
 * Cuatro pantallas las escribieron cuatro agentes en paralelo, cada uno
 * confinado a su carpeta. Un barrido a mano encontró **34 conceptos
 * implementados dos o más veces, 16 ya divergiendo**. Ninguna copia estaba mal
 * por separado; lo que estaba mal era que hubiera dos.
 *
 * Ese barrido fue manual y de una vez. Esto lo hace repetible, que es la
 * diferencia entre haber limpiado y no volver a ensuciarse.
 *
 * ── QUÉ CUENTA COMO DUPLICADO, Y POR QUÉ ESE FILTRO ───────────────────────
 *
 * Una cadena de clases de al menos 45 caracteres, **con al menos un token
 * `var(--…)` dentro**, que aparece literalmente en más de un fichero.
 *
 * El filtro del token es lo que separa la señal del ruido: `flex items-center
 * gap-2` en doce sitios es coincidencia. Una cadena que menciona
 * `--estado-abandonado-texto` y `--e-05` es una DECISIÓN de diseño, y una
 * decisión escrita dos veces acaba siendo dos decisiones.
 *
 * ── NO FALLA POR TENER DUPLICADOS: FALLA POR TENER MÁS ────────────────────
 *
 * Bajar de 14 a 0 no merece la pena: los que quedan son utilidades sueltas que
 * meter en una constante solo añadiría una indirección que hay que ir a leer.
 * Lo que sí importa es que el número **no suba** sin que nadie lo decida.
 *
 * Si sube legítimamente —porque el duplicado está justificado y anotado—, se
 * sube el techo A MANO, en el mismo commit, y ese diff es la conversación.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Techo actual. Bajó de 26 a 14 al unificar el mensaje de error, el anillo de
 * foco, la transición, el titular, la caja de control, el marco dorado y la
 * etiqueta de sección. Ver `code-style.md` § «Conceptos con un solo dueño».
 */
const TECHO = 14;

const RAIZ = "src";
const LONGITUD_MINIMA = 45;

const ficheros = [];
(function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (/\.tsx?$/.test(ruta) && !/\.test\./.test(ruta)) ficheros.push(ruta);
  }
})(RAIZ);

const vistas = new Map();
for (const fichero of ficheros) {
  const texto = readFileSync(fichero, "utf-8");
  for (const encontrado of texto.matchAll(/"([^"\n]+)"/g)) {
    const cadena = encontrado[1];
    if (cadena.length < LONGITUD_MINIMA) continue;
    if (!cadena.includes("var(--")) continue;
    // Solo lo que PARECE una lista de clases: si lleva mayúsculas o caracteres
    // de prosa, es un mensaje o una ruta, no un `className`.
    if (!/^[a-z0-9:_\-[\]()/,.%&>~+ ]+$/i.test(cadena)) continue;

    const donde = vistas.get(cadena) ?? new Set();
    donde.add(fichero);
    vistas.set(cadena, donde);
  }
}

const duplicadas = [...vistas.entries()].filter(([, donde]) => donde.size > 1);

if (duplicadas.length > TECHO) {
  console.error(
    `\nlint:duplicados — ${duplicadas.length} recetas de clases repetidas, ` +
      `y el techo son ${TECHO}.\n`,
  );
  for (const [cadena, donde] of duplicadas) {
    console.error(`  ${cadena.slice(0, 96)}${cadena.length > 96 ? "…" : ""}`);
    for (const fichero of donde) console.error(`      ${fichero}`);
  }
  console.error(
    "\nUna receta escrita dos veces acaba siendo dos recetas distintas. Dale un\n" +
      "dueño en `src/lib/ui/clases.ts` y anótalo en `code-style.md`, o —si el\n" +
      "duplicado está justificado— sube el TECHO de este script en el mismo\n" +
      "commit, con el motivo.\n",
  );
  process.exit(1);
}

console.log(
  `lint:duplicados — ${duplicadas.length} recetas repetidas de ${vistas.size} ` +
    `revisadas (techo ${TECHO}).`,
);
