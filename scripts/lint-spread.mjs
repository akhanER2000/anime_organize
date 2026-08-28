#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

import ts from "typescript";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SPREAD DE PROPS NO PUEDE IR DETRÁS DE LO QUE EL COMPONENTE CALCULA.
 *
 * ── EL FALLO, Y POR QUÉ NINGUNA OTRA PUERTA LO PARA ──────────────────────
 *
 * JSX aplica los atributos EN ORDEN y el último gana **entero**: no los mezcla.
 * Así que esto
 *
 *     <input className={cn(CONTROL, …)} {...resto} />
 *
 * pierde toda la receta de clases en cuanto `resto` trae un `className`. Pasó:
 * el campo «Portada» del modal salió en producción con 198 × 26 px y no se
 * podía escribir en él. Lo encontró un navegador, no la suite.
 *
 * `tsc` no lo ve —pasar `className` a algo que acepta `className` es
 * correcto—, ESLint no lo ve —no es estilo—, y ningún test que no RENDERICE
 * puede verlo. Un barrido de 23 componentes encontró **ocho más**, en cuatro
 * primitivas, todos sin síntoma todavía porque nadie pasaba aún la prop que
 * los dispara. Incluido `rel="noopener noreferrer"` en los enlaces externos,
 * que es una garantía de seguridad (security.md §6) sobre URLs que pega el
 * usuario, y cuyo comentario decía «no es configurable A PROPÓSITO».
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   **LOS SPREADS VAN PRIMERO. LO QUE EL COMPONENTE GARANTIZA, DESPUÉS.**
 *
 * Así el reparto queda dicho en el propio orden: delante, lo que el llamador
 * puede elegir; detrás, lo que la primitiva promete y nadie puede quitarle.
 *
 * Esto NO es una preferencia de estilo. Es la única puerta automática que
 * existe para esta clase de fallo, porque el resto de puertas ya se probaron.
 *
 * ── CUANDO DE VERDAD HAGA FALTA AL REVÉS ─────────────────────────────────
 *
 * A veces se quiere que el llamador pise: un valor por defecto que la pantalla
 * ajusta. Entonces se escribe el motivo y se sigue:
 *
 *     <Cosa valor={pordefecto} {...resto} />  // lint-spread-ok: el llamador manda
 *
 * Ese comentario sale en el diff, que es donde se tiene la conversación.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ESCAPE = "lint-spread-ok:";

/**
 * Los .test.tsx quedan fuera, y no por comodidad: un test de esta clase
 * ATACA al componente a propósito —le esparce encima justo la prop que
 * intenta pisar la garantía— y esa es su razón de existir. Marcarlos con el
 * escape sería seis líneas de ruido diciendo lo que el nombre del fichero ya
 * dice. Lo que se persigue aquí es el spread que nadie escribió a sabiendas.
 */
const ficheros = globSync("src/**/*.tsx")
  .filter((f) => !f.endsWith(".test.tsx"))
  .sort();
const faltas = [];

for (const fichero of ficheros) {
  const texto = readFileSync(fichero, "utf8");
  const fuente = ts.createSourceFile(
    fichero,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visitar = (nodo) => {
    if (ts.isJsxOpeningElement(nodo) || ts.isJsxSelfClosingElement(nodo)) {
      const props = nodo.attributes.properties;
      const primerAtributo = props.findIndex(ts.isJsxAttribute);

      props.forEach((prop, i) => {
        if (!ts.isJsxSpreadAttribute(prop)) return;
        if (primerAtributo === -1 || primerAtributo > i) return;

        const { line } = fuente.getLineAndCharacterOfPosition(prop.getStart(fuente));
        // El escape se busca en la línea del spread y en la anterior: cabe
        // detrás del código o encima, como el de los tokens.
        const lineas = texto.split("\n");
        const enLinea = (n) => (lineas[n] ?? "").includes(ESCAPE);
        if (enLinea(line) || enLinea(line - 1)) return;

        const pisadas = props
          .slice(0, i)
          .filter(ts.isJsxAttribute)
          .map((a) => a.name.getText(fuente));

        faltas.push({
          fichero,
          linea: line + 1,
          elemento: nodo.tagName.getText(fuente),
          spread: prop.getText(fuente),
          pisadas,
        });
      });
    }

    ts.forEachChild(nodo, visitar);
  };

  visitar(fuente);
}

if (faltas.length === 0) {
  console.log(`lint:spread — ${String(ficheros.length)} ficheros .tsx, ningún spread por detrás.`);
  process.exit(0);
}

console.error(
  `\nlint:spread — ${String(faltas.length)} spread(s) DETRÁS de lo que el componente calcula:\n`,
);
for (const f of faltas) {
  console.error(`  ${f.fichero}:${String(f.linea)}  <${f.elemento}>  ${f.spread}`);
  console.error(`      puede pisar: ${f.pisadas.join(", ")}`);
}
console.error(`
  JSX aplica los atributos en orden y el último gana ENTERO. Mueve el spread
  DELANTE de lo que el componente garantiza, o escribe el motivo:
      {...resto}  // ${ESCAPE} <por qué el llamador debe poder pisar>
`);
process.exit(1);
