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

console.error(
  `\nlint:tokens — ${hallazgos.length} color(es) literal(es) fuera de ${PERMITIDO}:\n`,
);

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
