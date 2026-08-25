#!/usr/bin/env node
/**
 * Guardián de los tokens de diseño.
 *
 * REGLA 0 de `.claude/rules/design-tokens.md`: está prohibido escribir un color
 * literal fuera del bloque `@theme` de `src/app/globals.css`, que es la
 * traducción literal de `design/tokens.json`.
 *
 * Sin esto, la regla es una intención. Con esto, el build falla.
 *
 *     npm run lint:tokens
 *
 * Escape puntual, con motivo obligatorio en la misma línea o en la anterior:
 *     // lint-tokens-ok: el favicon SVG no puede usar var()
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** Único fichero donde puede vivir un color literal. */
const PERMITIDO = join("src", "app", "globals.css");

const CARPETAS = ["src", "scripts"];
const EXTENSIONES = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"];
const IGNORAR = new Set(["node_modules", ".next", "dist", "coverage", "design", ".git"]);

/** El propio linter contiene los patrones que busca. */
const SE_IGNORA_A_SI_MISMO = join("scripts", "lint-tokens.mjs");

/** Marca de escape. Debe ir acompañada de un motivo. */
const ESCAPE = /lint-tokens-ok:\s*\S+/;

const PATRONES = [
  {
    nombre: "hex",
    // #RGB #RGBA #RRGGBB #RRGGBBAA. El lookahead evita partir un hash largo
    // (un sha256 en un comentario no es un color).
    regex: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/g,
    consejo: "Usa una utilidad de token (bg-slate-850) o var(--gold-400).",
  },
  {
    // HALLAZGO DE LA REVISION ADVERSARIAL: `stroke='%23E6E2DA'` dentro de un
    // data-URI de SVG es un hex escrito a mano (%23 es `#` codificado) y pasaba
    // sin que nadie lo viera, en un fichero cuya cabecera dice «NINGUN COLOR
    // LITERAL». Si manana cambia la porcelana en tokens.json, la textura de las
    // doce pantallas se queda en el valor viejo, en silencio.
    nombre: "hex codificado en URL (%23)",
    regex: /%23(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/g,
    consejo:
      "Es un hex dentro de un data-URI. Si de verdad no admite var(), anotalo " +
      "con // lint-tokens-ok: <por que>",
  },
  {
    nombre: "rgb()/rgba()",
    regex: /\brgba?\s*\(/g,
    consejo: "Los derivados permitidos ya existen como token: var(--gold-wash), etc.",
  },
  {
    nombre: "hsl()/hsla()",
    regex: /\bhsla?\s*\(/g,
    consejo: "El sistema no usa HSL. Usa los tokens.",
  },
  {
    nombre: "color con nombre CSS",
    // Solo donde de verdad es un color: en una propiedad CSS o una utilidad
    // arbitraria de Tailwind. `white` suelto en un texto no es un fallo.
    regex:
      /(?:color|background|background-color|border-color|fill|stroke|outline-color)\s*:\s*(?:white|black|red|blue|green|gray|grey|silver|gold|orange|purple|yellow)\b/gi,
    consejo: "Nada de colores con nombre: usa los tokens del sistema.",
  },
  {
    // ── CONTRASTE, NO ESTÉTICA ────────────────────────────────────────────
    // `--ash-inactivo` (#565E68) no alcanza 4.5:1 sobre NINGUNA superficie del
    // sistema: 2.94:1 sobre slate-950 y 2.44:1 sobre slate-800, que es el fondo
    // del input. WCAG 2.1 exime al texto de controles **deshabilitados**
    // (1.4.3), y el placeholder no porta información que no esté en la
    // etiqueta. Fuera de esos dos casos es texto ilegible.
    //
    // El color NO se toca —el diseño está aprobado y para ese uso es correcto—.
    // Lo que se impide es que se use como «gris de texto secundario», que es
    // exactamente para lo que se estaba colando cuando se llamaba `--ash-500`.
    //
    // Mínimo para texto ACTIVO: `--ash-400`, y con salvedad —4.17:1 sobre
    // `--slate-800`, así que sobre esa superficie el mínimo es
    // `--porcelain-200`—.
    nombre: "texto inactivo fuera de un estado inactivo",
    regex:
      /var\(--ash-inactivo\)|(?:^|[\s"'`:[])(?:text|bg|border|fill|stroke|ring|outline|decoration)-ash-500\b/g,
    // Si la línea declara el estado, el uso es legítimo y no hace falta nada
    // más. Ojo: NO vale buscar «inactiv», porque el propio nombre del token lo
    // contiene y la excepción se tragaría todos los casos.
    salvoSi: /disabled|placeholder|:disabled|aria-disabled/i,
    consejo:
      "Texto activo: usa --ash-400 (o --porcelain-200 sobre --slate-800). " +
      "Si de verdad es un estado inactivo, dilo en la línea o marca " +
      "`lint-tokens-ok: <motivo>`.",
  },
];

/** Falsos positivos conocidos que NO son colores. */
const NO_ES_COLOR = [
  /^#[0-9a-fA-F]{3,8}$/.source && /sha256|checksum|commit|hash/i,
  /#!\//, // shebang
  /\bU\+[0-9a-fA-F]{4}/, // punto de código Unicode
];

function* ficheros(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return;
  }
  for (const entrada of entradas) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    const info = statSync(ruta);
    if (info.isDirectory()) {
      yield* ficheros(ruta);
    } else if (EXTENSIONES.some((e) => entrada.endsWith(e))) {
      yield ruta;
    }
  }
}

const hallazgos = [];
let revisados = 0;

for (const carpeta of CARPETAS) {
  for (const ruta of ficheros(join(RAIZ, carpeta))) {
    const rel = relative(RAIZ, ruta);
    if (rel.split(sep).join(sep) === PERMITIDO) continue;
    if (rel.split(sep).join(sep) === SE_IGNORA_A_SI_MISMO) continue;

    revisados += 1;
    const lineas = readFileSync(ruta, "utf-8").split(/\r?\n/);

    lineas.forEach((linea, i) => {
      // Escape explícito, en esta línea o en la anterior.
      if (ESCAPE.test(linea) || (i > 0 && ESCAPE.test(lineas[i - 1] ?? ""))) return;
      if (NO_ES_COLOR.some((p) => p instanceof RegExp && p.test(linea))) return;

      for (const patron of PATRONES) {
        // Excepción propia del patrón: el contexto de la línea lo legitima.
        if (patron.salvoSi instanceof RegExp && patron.salvoSi.test(linea)) continue;
        patron.regex.lastIndex = 0;
        const encontrados = linea.match(patron.regex);
        if (encontrados !== null) {
          hallazgos.push({
            fichero: rel,
            linea: i + 1,
            texto: linea.trim().slice(0, 100),
            valores: [...new Set(encontrados)].join(", "),
            tipo: patron.nombre,
            consejo: patron.consejo,
          });
        }
      }
    });
  }
}

if (hallazgos.length === 0) {
  console.log(`lint:tokens — ${revisados} ficheros revisados, ningún color literal.`);
  process.exit(0);
}

console.error(`\nlint:tokens — ${hallazgos.length} color(es) literal(es) fuera de ${PERMITIDO}:\n`);

for (const h of hallazgos) {
  console.error(`  ${h.fichero}:${h.linea}  [${h.tipo}: ${h.valores}]`);
  console.error(`    ${h.texto}`);
  console.error(`    → ${h.consejo}\n`);
}

console.error(
  "La paleta vive en design/tokens.json y se traduce UNA vez en\n" +
    `${PERMITIDO}. Ver .claude/rules/design-tokens.md (Regla 0).\n\n` +
    "Si de verdad hace falta una excepción, anótala con el motivo:\n" +
    "    // lint-tokens-ok: <por qué>\n",
);

process.exit(1);
