#!/usr/bin/env node
/**
 * VERIFICACIÓN POR MUTACIÓN DEL CONTRATO DE DATOS.
 *
 * `.claude/rules/testing.md` exige que todo límite de seguridad se verifique
 * ROMPIÉNDOLO a propósito. El contrato de datos es el límite más importante del
 * proyecto, así que su verificación no puede ser manual y de una vez: es esto,
 * y corre en cada ejecución de CI.
 *
 * QUÉ HACE: escribe ficheros que intentan saltarse el contrato de siete formas
 * distintas, comprueba que **las siete son rechazadas** por el compilador o por
 * el linter, y los borra.
 *
 * Y comprueba un CONTROL POSITIVO: un fichero que usa el vault correctamente y
 * que SÍ debe compilar. Sin él, un `tsconfig` roto haría fallar todos los
 * intentos y el script daría verde por el motivo equivocado.
 *
 *     node scripts/verificar-contrato.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const CARPETA = join(RAIZ, "src", "__contrato-tmp__");

/** Cada intento de saltarse el contrato, y quién debe pararlo. */
const INTENTOS = [
  {
    nombre: "forjar un contexto con un literal",
    quienLoPara: "compilador",
    fichero: "forjar-literal.ts",
    codigo: `
import type { ContextoUsuario } from "@/lib/db";

// Un objeto estructuralmente idéntico. Debe fallar por la marca nominal.
export const robado: ContextoUsuario = { userId: "de-otro-usuario" };
`,
  },
  {
    nombre: "construir un contexto con new",
    quienLoPara: "compilador",
    fichero: "forjar-new.ts",
    codigo: `
import { ContextoUsuario } from "@/lib/db";

// El constructor es privado. Debe fallar.
export const robado = new ContextoUsuario("de-otro-usuario");
`,
  },
  {
    nombre: "castear un objeto plano a contexto",
    quienLoPara: "linter",
    fichero: "forjar-as.ts",
    codigo: `
import type { ContextoUsuario } from "@/lib/db";

// EL ÚNICO HUECO DEL COMPILADOR: la aserción se permite porque los tipos
// "se solapan" lo suficiente. Lo para la regla no-restricted-syntax.
export const robado = { userId: "de-otro-usuario" } as ContextoUsuario;
`,
  },
  {
    nombre: "importar una tabla cruda desde la aplicación",
    quienLoPara: "linter",
    fichero: "tabla-cruda.ts",
    codigo: `
import { anime } from "@/lib/db/schema";

export const tabla = anime;
`,
  },
  {
    nombre: "importar el cliente sin filtro",
    quienLoPara: "linter",
    fichero: "cliente-crudo.ts",
    codigo: `
import { dbInterna } from "@/lib/db/interno";

export const cliente = dbInterna();
`,
  },
  {
    nombre: "crear un contexto a mano fuera de auth.ts",
    quienLoPara: "linter",
    fichero: "fabricar-contexto.ts",
    codigo: `
import { ContextoUsuario } from "@/lib/db";

export const robado = ContextoUsuario.desdeSesionVerificada("de-otro-usuario");
`,
  },
  {
    nombre: "abrir el vault sin contexto",
    quienLoPara: "compilador",
    fichero: "vault-sin-contexto.ts",
    codigo: `
import { vaultDe } from "@/lib/db";

// Sin argumento: el parámetro es obligatorio. Debe fallar.
export const vault = vaultDe();
`,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LOS CINCO QUE ENCONTRÓ EL ATAQUE ADVERSARIAL (2026-08-23).
  // El contrato prometía más de lo que cumplía: estos cinco pasaban.
  // ═══════════════════════════════════════════════════════════════════════
  {
    nombre: "fabricar un contexto de otro usuario con el helper de pruebas",
    quienLoPara: "linter",
    fichero: "contexto-de-pruebas.ts",
    codigo: `
import { contextoDePrueba } from "@/lib/db/contexto-pruebas";
import { vaultDe } from "@/lib/db";

// ENCONTRADO POR EL ATAQUE ADVERSARIAL: era un estatico publico de la clase
// (ContextoUsuario.paraPruebas) y la regla solo vigilaba la otra fabrica.
export const robado = vaultDe(contextoDePrueba("de-otro-usuario"));
`,
  },
  {
    nombre: "conectar al driver a pelo y lanzar SQL crudo",
    quienLoPara: "linter",
    fichero: "driver-a-pelo.ts",
    codigo: `
import { neon } from "@neondatabase/serverless";

// ENCONTRADO POR EL ATAQUE: sin tablas, sin vault, sin contexto.
// El vault entero de TODOS los usuarios.
export async function todoDeTodos() {
  const sql = neon(process.env.DATABASE_URL ?? "");
  return sql\`select id, user_id, title from anime\`;
}
`,
  },
  {
    nombre: "usar el cliente de pruebas desde la aplicación",
    quienLoPara: "linter",
    fichero: "cliente-de-pruebas.ts",
    codigo: `
import { crearClientePrueba, urlDePruebas } from "@/lib/db/cliente-test";

// ENCONTRADO POR EL ATAQUE: devuelve un drizzle con el esquema completo, asi
// que \`db.query.anime.findMany()\` sale sin filtro alguno.
export async function todos() {
  const { db } = crearClientePrueba(urlDePruebas() ?? "");
  return db.query.anime.findMany();
}
`,
  },
  {
    nombre: "esquivar el lint con un import dinámico",
    quienLoPara: "linter",
    fichero: "import-dinamico.ts",
    codigo: `
// ENCONTRADO POR EL ATAQUE: \`no-restricted-imports\` solo mira los imports
// ESTATICOS. Un \`await import()\` llegaba al mismo modulo por la puerta de atras.
export async function crudo() {
  const modulo = await import("@/lib/db/interno");
  return modulo.dbInterna();
}
`,
  },
  {
    nombre: "importar el módulo de propiedad con un userId suelto",
    quienLoPara: "compilador",
    fichero: "ownership-suelto.ts",
    codigo: `
// ENCONTRADO POR EL ATAQUE: \`ownership.ts\` exportaba
// \`exigirAnimePropio(db, { userId })\`, que recibia el userId como string
// SUELTO — cualquiera podia pasar el de otro. El modulo se ELIMINO: su trabajo
// lo hace el vault, donde el filtro no se puede omitir.
import { exigirAnimePropio } from "@/lib/db/ownership";

export const f = exigirAnimePropio;
`,
  },
];

/** El uso CORRECTO. Si esto no compila, el script está midiendo otra cosa. */
const CONTROL_POSITIVO = {
  nombre: "el uso correcto SÍ compila",
  fichero: "control-positivo.ts",
  codigo: `
import { vaultDe, type ContextoUsuario } from "@/lib/db";

export async function listarLoMio(ctx: ContextoUsuario) {
  const vault = vaultDe(ctx);
  return vault.listar();
}
`,
};

function limpiar() {
  if (existsSync(CARPETA)) rmSync(CARPETA, { recursive: true, force: true });
}

/** Ejecuta un comando y devuelve `{ ok, salida }` sin lanzar. */
function ejecutar(comando, args) {
  try {
    const salida = execFileSync(comando, args, {
      cwd: RAIZ,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    return { ok: true, salida };
  } catch (error) {
    return {
      ok: false,
      salida: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

let fallos = 0;
function comprobar(etiqueta, ok, detalle = "") {
  console.log(`  ${ok ? "OK   " : "FALLO"} ${etiqueta}${detalle !== "" ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
}

limpiar();
mkdirSync(CARPETA, { recursive: true });

try {
  // Se escriben todos los ficheros de golpe: tsc analiza el proyecto entero,
  // así que una sola pasada sirve para todos los intentos.
  for (const intento of INTENTOS) {
    writeFileSync(join(CARPETA, intento.fichero), intento.codigo.trimStart(), "utf-8");
  }
  writeFileSync(
    join(CARPETA, CONTROL_POSITIVO.fichero),
    CONTROL_POSITIVO.codigo.trimStart(),
    "utf-8",
  );

  console.log("\n=== CONTROL POSITIVO ===");
  const tsc = ejecutar("npx", ["tsc", "--noEmit"]);
  const controlRechazado = tsc.salida.includes(CONTROL_POSITIVO.fichero);
  comprobar(
    CONTROL_POSITIVO.nombre,
    !controlRechazado,
    controlRechazado ? "el uso correcto NO compila: el contrato estorba" : "",
  );

  console.log("\n=== INTENTOS DE SALTARSE EL CONTRATO ===");
  console.log("  (todos deben ser RECHAZADOS)\n");

  for (const intento of INTENTOS) {
    const ruta = `src/__contrato-tmp__/${intento.fichero}`;

    if (intento.quienLoPara === "compilador") {
      const rechazado = tsc.salida.includes(intento.fichero);
      comprobar(
        `[compilador] ${intento.nombre}`,
        rechazado,
        rechazado ? "" : "COMPILÓ. El contrato tiene un agujero.",
      );
    } else {
      const lint = ejecutar("npx", ["eslint", "--no-warn-ignored", ruta]);
      comprobar(
        `[linter] ${intento.nombre}`,
        !lint.ok,
        lint.ok ? "PASÓ EL LINT. El contrato tiene un agujero." : "",
      );
    }
  }
} finally {
  limpiar();
}

if (fallos === 0) {
  console.log(
    `\nContrato verificado: ${INTENTOS.length} intentos de salto, ${INTENTOS.length} rechazados.\n`,
  );
  process.exit(0);
}

console.error(
  `\n${fallos} COMPROBACIÓN(ES) FALLIDA(S).\n\n` +
    "Si un intento de salto ha pasado, el contrato de datos ya no garantiza lo\n" +
    "que dice garantizar. Ver src/lib/db/contexto.ts.\n",
);
process.exit(1);
