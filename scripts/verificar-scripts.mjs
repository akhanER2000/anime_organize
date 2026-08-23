#!/usr/bin/env node
/**
 * Comprueba que todo script declarado en `package.json` existe de verdad.
 *
 * POR QUÉ EXISTE: `lint:tokens` estuvo declarado durante toda una fase apuntando
 * a un fichero que nunca se escribió. `npm run verificar` habría fallado con
 * `MODULE_NOT_FOUND`, pero nadie lo vio porque los pasos se ejecutaban por
 * separado. **Un script declarado y no escrito es una mentira que solo se
 * descubre cuando alguien confía en él** — normalmente, en CI o en un deploy.
 *
 *     node scripts/verificar-scripts.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf-8"));
const scripts = paquete.scripts ?? {};

/**
 * Extrae rutas de fichero de una línea de comando.
 *
 * Solo se comprueban las rutas EXPLÍCITAS (las que empiezan por `./`, `scripts/`
 * o similares). Un binario del PATH (`next`, `tsc`, `eslint`) no es una ruta:
 * si falta, es un problema de dependencias y lo dice `npm install`.
 */
function rutasDe(comando) {
  const rutas = [];

  // Ejecutores que reciben un fichero como primer argumento no-bandera.
  const EJECUTORES = /\b(?:node|tsx|ts-node|npx\s+tsx)\s+(?!-)([^\s&|;]+)/g;
  for (const m of comando.matchAll(EJECUTORES)) {
    if (m[1] !== undefined) rutas.push(m[1]);
  }

  // Rutas sueltas con extensión conocida, aunque no vayan tras un ejecutor
  // (por ejemplo un `--config ./algo.ts`).
  const SUELTAS = /(?:^|\s)((?:\.\/|scripts\/|src\/|e2e\/)[^\s&|;]+\.(?:m?js|cjs|ts|tsx|json))/g;
  for (const m of comando.matchAll(SUELTAS)) {
    if (m[1] !== undefined) rutas.push(m[1]);
  }

  return [...new Set(rutas)];
}

/** Scripts que solo encadenan otros (`npm run a && npm run b`). */
function scriptsReferenciados(comando) {
  const referencias = [];
  for (const m of comando.matchAll(/\bnpm\s+run\s+([\w:.-]+)/g)) {
    if (m[1] !== undefined) referencias.push(m[1]);
  }
  return referencias;
}

/**
 * Herramientas que NO son una ruta de fichero pero necesitan su config para
 * funcionar. `lint` estuvo declarado sin `eslint.config.mjs`: el validador no
 * lo veía porque `eslint` es un binario del PATH, no una ruta.
 */
const HERRAMIENTAS_CON_CONFIG = [
  {
    binario: /\beslint\b/,
    candidatos: ["eslint.config.mjs", "eslint.config.js", "eslint.config.cjs", "eslint.config.ts"],
    que: "configuración de ESLint",
  },
  {
    binario: /\bvitest\b/,
    candidatos: ["vitest.config.ts", "vitest.config.mjs", "vitest.config.js", "vite.config.ts"],
    que: "configuración de Vitest",
  },
  {
    binario: /\bplaywright\b/,
    candidatos: ["playwright.config.ts", "playwright.config.js"],
    que: "configuración de Playwright",
  },
  {
    binario: /\bdrizzle-kit\b/,
    candidatos: ["drizzle.config.ts", "drizzle.config.js"],
    que: "configuración de drizzle-kit",
  },
  {
    binario: /\bprettier\b/,
    candidatos: [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.mjs",
      "prettier.config.mjs",
      "prettier.config.js",
    ],
    que: "configuración de Prettier",
  },
];

const problemas = [];
let comprobadas = 0;

for (const [nombre, comando] of Object.entries(scripts)) {
  if (typeof comando !== "string") continue;

  for (const ruta of rutasDe(comando)) {
    comprobadas += 1;
    const absoluta = join(RAIZ, ruta.replace(/^\.\//, ""));
    if (!existsSync(absoluta)) {
      problemas.push({
        tipo: "FICHERO_INEXISTENTE",
        script: nombre,
        detalle: `apunta a "${ruta}", que no existe`,
        comando,
      });
    }
  }

  // Herramientas que necesitan su fichero de configuración.
  for (const herramienta of HERRAMIENTAS_CON_CONFIG) {
    if (!herramienta.binario.test(comando)) continue;
    comprobadas += 1;
    if (!herramienta.candidatos.some((c) => existsSync(join(RAIZ, c)))) {
      problemas.push({
        tipo: "CONFIG_AUSENTE",
        script: nombre,
        detalle:
          `usa una herramienta que necesita ${herramienta.que}, y no se encontró ` +
          `ninguno de: ${herramienta.candidatos.join(", ")}`,
        comando,
      });
    }
  }

  // Un script agregado que llama a otro inexistente falla igual de feo.
  for (const referencia of scriptsReferenciados(comando)) {
    if (!(referencia in scripts)) {
      problemas.push({
        tipo: "SCRIPT_INEXISTENTE",
        script: nombre,
        detalle: `llama a "npm run ${referencia}", que no está declarado`,
        comando,
      });
    }
  }
}

if (problemas.length === 0) {
  console.log(
    `verificar-scripts — ${Object.keys(scripts).length} scripts, ` +
      `${comprobadas} referencias a fichero, todas existen.`,
  );
  process.exit(0);
}

console.error(`\nverificar-scripts — ${problemas.length} problema(s) en package.json:\n`);
for (const p of problemas) {
  console.error(`  [${p.tipo}] script "${p.script}"`);
  console.error(`    ${p.detalle}`);
  console.error(`    comando: ${p.comando}\n`);
}
console.error(
  "Un script declarado y no escrito solo se descubre cuando alguien confía en\n" +
    "él: en CI, en un hook o en un despliegue. Escríbelo o quítalo.\n",
);
process.exit(1);
