/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CARGA INICIAL DEL VAULT — los 83 animes reales y sus portadas.
 *
 *     npm run seed                     carga todo
 *     npm run seed -- --sin-portadas   solo los animes, sin descargar imágenes
 *     npm run seed -- --dry-run        dice qué haría y no toca nada
 *
 * ── ES IDEMPOTENTE ────────────────────────────────────────────────────────
 * Se puede correr N veces y el resultado es el mismo. La deduplicación la
 * garantiza `uq_anime_user_title_norm` en la base, no una comprobación previa:
 * una comprobación previa deja una ventana entre el `SELECT` y el `INSERT`.
 *
 * ── LOS LOTES BLOQUEAN SOLO POR COINCIDENCIA EXACTA ───────────────────────
 * **Nunca por similitud.** Es la regla crítica de la skill de dominio §2: si el
 * seed descartara por trigram, tiraría los tres *Higurashi* y los dos *White
 * Album*, que están en la lista **a propósito** y son series distintas. La
 * similitud es para el flujo interactivo, donde hay un humano decidiendo.
 *
 * ── LAS PORTADAS PASAN POR EL MISMO PIPELINE QUE /api/covers ──────────────
 * El mismo descargador con defensa SSRF y el mismo `sharp`. No hay un atajo
 * «como es nuestro Drive, me fío»: si el pipeline tuviera un fallo, el seed lo
 * ejercita igual que un usuario pegando una URL, y así se encuentra aquí y no
 * en producción.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { hashearPassword } from "../src/lib/auth/password";
import { marcaDeRevocacion } from "../src/lib/auth/sesion";
import { descargarImagen } from "../src/lib/covers/descargar";
import { procesarPortada } from "../src/lib/covers/procesar";
import { contextoDeScript } from "../src/lib/db/contexto-fuera-de-sesion";
import { dbInterna } from "../src/lib/db/interno";
import { anunciarDestino, exigirMismaRama } from "./rama-destino";
import { users } from "../src/lib/db/schema";
import { vaultDe } from "../src/lib/db/vault";
import { ESTADOS } from "../src/lib/domain/enums";
import { mapearProgresoDelSeed } from "../src/lib/domain/progreso";
import { normalizarTitulo } from "../src/lib/domain/normalizar";

import { cargarEntorno, vinoDelEntorno } from "./cargar-entorno";

cargarEntorno();

// ── CONTRA QUÉ BASE SE VA A SEMBRAR ─────────────────────────────────────────
//
// El seed escribe 83 animes, sus portadas y una cuenta. Hacerlo en la rama
// equivocada de Neon no tiene deshacer, y `development` y `production` se
// parecen lo suficiente como para confundirlas cuando la cadena viaja en la
// línea de comandos. Se dice el host antes de escribir nada — nunca la cadena
// entera, que lleva la contraseña dentro.
exigirMismaRama();
anunciarDestino(process.env.DATABASE_URL ?? "", {
  variable: "DATABASE_URL",
  pasadaEnLinea: vinoDelEntorno("DATABASE_URL"),
});

type FilaSeed = {
  titulo: string;
  estado: string;
  estadoOriginal: string;
  progresoEtiqueta: string;
  progresoTipo: string;
  portada?: {
    driveFileId?: string;
    directUrl?: string;
    ext?: string;
  } | null;
};

const argumentos = new Set(process.argv.slice(2));
const SIN_PORTADAS = argumentos.has("--sin-portadas");
const ENSAYO = argumentos.has("--dry-run");

/** Concurrencia de descarga. Drive corta si se le aprieta más. */
const A_LA_VEZ = 4;

function correoDelPropietario(): string {
  const email = process.env.SEED_OWNER_EMAIL;
  if (email === undefined || email.trim() === "") {
    throw new Error(
      "Falta SEED_OWNER_EMAIL. El seed carga el vault de UNA persona concreta, " +
        "así que hay que decir de quién. Ver .env.example.",
    );
  }
  return email.trim().toLowerCase();
}

async function principal(): Promise<void> {
  const ruta = join(process.cwd(), "animes-seed.json");
  const bruto: unknown = JSON.parse(readFileSync(ruta, "utf-8"));

  const filas = extraerFilas(bruto);
  console.log(`\n  ${String(filas.length)} animes en animes-seed.json`);

  // ── Comprobación que evita perder animes en silencio ────────────────────
  // Los 83 títulos reales tienen que producir 83 normalizados ÚNICOS. Si un
  // cambio en `normalizarTitulo` introdujera una colisión, el `UNIQUE` de la
  // base descartaría uno y el seed diría «83 procesados» tan tranquilo.
  const normalizados = new Set(filas.map((f) => normalizarTitulo(f.titulo)));
  if (normalizados.size !== filas.length) {
    throw new Error(
      `COLISIÓN DE NORMALIZACIÓN: ${String(filas.length)} títulos producen solo ` +
        `${String(normalizados.size)} normalizados únicos. Se perderían animes. ` +
        "Ver la skill de dominio §1 antes de tocar `normalizarTitulo`.",
    );
  }
  console.log(`  ${String(normalizados.size)} normalizados únicos · sin colisiones`);

  const email = correoDelPropietario();
  const [propietario] = await dbInterna()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (ENSAYO) {
    // ── EL ENSAYO NO ESCRIBE NADA. NI SIQUIERA LA CUENTA ──────────────────
    // La primera versión creaba la cuenta del propietario ANTES de mirar esta
    // bandera. O sea que `--dry-run` escribía en la base: exactamente lo que un
    // ensayo promete no hacer. Lo vi al ejecutarlo, no al leerlo — un `--dry-run`
    // con efectos es de las mentiras más caras que puede decir un script.
    const queHariaConLaCuenta = propietario === undefined ? "CREARÍA la cuenta de" : "usaría la de";
    console.log(`\n  [ensayo] ${queHariaConLaCuenta} ${email}`);
    console.log(`  [ensayo] cargaría ${String(filas.length)} animes`);
    console.log(`  [ensayo] ${SIN_PORTADAS ? "sin" : "con"} portadas`);
    console.log("  [ensayo] no se ha escrito nada\n");
    return;
  }

  let propietarioId = propietario?.id;

  if (propietarioId === undefined) {
    // ── SE CREA LA CUENTA CON LAS CREDENCIALES QUE ELIGIÓ SU DUEÑO ────────
    // `SEED_OWNER_PASSWORD` vive en `.env.local`, que no se commitea. No se
    // inventa ninguna contraseña ni se escribe en pantalla: si falta la
    // variable, se para y se dice.
    const password = process.env.SEED_OWNER_PASSWORD;
    if (password === undefined || password.trim() === "") {
      throw new Error(
        `No existe la cuenta de ${email} y falta SEED_OWNER_PASSWORD para crearla. ` +
          "Ponla en .env.local, o regístrate en /registro y vuelve a lanzar el seed.",
      );
    }

    if (password.length < 12) {
      throw new Error(
        "SEED_OWNER_PASSWORD tiene menos de 12 caracteres, que es el mínimo que exige " +
          "el registro. Una cuenta creada por el seed con una contraseña que la propia " +
          "aplicación rechazaría es una incoherencia que muerde más tarde.",
      );
    }

    const [creada] = await dbInterna()
      .insert(users)
      .values({
        email,
        passwordHash: await hashearPassword(password),
        // Verificado: la bandera de verificación está apagada por defecto y no
        // hay correo que mandar. Dejarlo en `null` haría que el día que se
        // encienda, el dueño no pudiera entrar en su propio vault.
        emailVerified: new Date(),
        // Del reloj de la APLICACIÓN. Ver `db-conventions.md` § «Dos relojes».
        sessionsValidFrom: marcaDeRevocacion(new Date()),
      })
      .returning({ id: users.id });

    if (creada === undefined) throw new Error("no se pudo crear la cuenta del propietario");
    propietarioId = creada.id;
    console.log(`  cuenta creada para ${email}`);
  }

  // El seed escribe en el vault de su dueño, por la MISMA puerta que la
  // aplicación: `vaultDe(ctx)`. No hay una vía privilegiada para los scripts.
  const vault = vaultDe(
    contextoDeScript(propietarioId, "npm run seed, lanzado por el dueño del vault"),
  );

  const problemas: string[] = [];
  let creados = 0;
  let yaEstaban = 0;
  let conProgreso = 0;

  for (const fila of filas) {
    // Se PARSEA, no se castea. `code-style.md`: lo que cruza una frontera —y un
    // JSON del disco la cruza— se valida. Un estado que no esté en la lista
    // sería un `CHECK` violado en la base, o sea un 500 en vez de un aviso.
    const estado = ESTADOS.find((e) => e === fila.estado);
    if (estado === undefined) {
      problemas.push(`${fila.titulo}: estado desconocido «${fila.estado}»`);
      continue;
    }

    const creado = await vault.crear({ titulo: fila.titulo, estado });

    if (creado === null) {
      // `crear` devuelve null si choca con el UNIQUE: ya estaba. Es lo que hace
      // idempotente al seed.
      yaEstaban += 1;
      continue;
    }
    creados += 1;

    // ── EL PROGRESO SE ESCRIBE, NO SOLO SE MAPEA ──────────────────────────
    // La primera versión llamaba a `mapearProgresoDelSeed` y usaba el resultado
    // **solo para detectar tipos desconocidos**: los 83 animes se cargaban con
    // cero filas en `progress`, así que la biblioteca no tenía ni etiqueta ni
    // barra. Lo destapó el agente que escribió la rejilla al preguntarse por qué
    // la barra no podía llevar relleno — la respuesta no era de diseño, era que
    // el dato no existía.
    const progreso = mapearProgresoDelSeed(fila.progresoTipo, fila.progresoEtiqueta);
    if ("desconocido" in progreso) {
      problemas.push(`${fila.titulo}: progreso desconocido «${progreso.tipo}»`);
      continue;
    }

    await vault.guardarProgreso(creado.id, {
      kind: progreso.kind,
      label: progreso.label,
      temporada: progreso.season,
    });
    conProgreso += 1;
  }

  console.log(
    `\n  animes: ${String(creados)} creados · ${String(yaEstaban)} ya estaban · ` +
      `${String(conProgreso)} con progreso`,
  );

  // ── EL PROGRESO DE LOS QUE YA ESTABAN ───────────────────────────────────
  // Un seed que solo escribiera el progreso de los animes NUEVOS dejaría sin
  // progreso a los 83 de una carga anterior. Se rellena el que falte: sigue
  // siendo idempotente, porque `guardarProgreso` reemplaza con el mismo valor.
  //
  // Existe porque el seed se corrió una vez sin escribir progreso, y sin esto
  // volver a lanzarlo no habría arreglado nada —los 83 «ya estaban»— y habría
  // hecho falta borrar la base para recuperarse de un fallo mío. Un script de
  // carga tiene que poder CONVERGER, no solo empezar de cero.
  const rellenados = await rellenarProgresoQueFalte(filas, vault, problemas);
  if (rellenados > 0) console.log(`  progreso rellenado en ${String(rellenados)} ya existentes`);

  if (!SIN_PORTADAS) {
    await cargarPortadas(filas, vault, problemas);
  }

  if (problemas.length > 0) {
    console.log(`\n  ${String(problemas.length)} avisos:`);
    for (const p of problemas.slice(0, 20)) console.log(`    · ${p}`);
    if (problemas.length > 20) console.log(`    … y ${String(problemas.length - 20)} más`);
  }

  console.log("\n  Listo.\n");
}

/**
 * Descarga las portadas con concurrencia acotada.
 *
 * **Un fallo de portada NO tumba el seed.** El anime ya está creado y sirve sin
 * imagen —`/api/covers` devuelve el placeholder de laja—; perder los 83 porque
 * Drive tuvo un mal minuto sería mucho peor.
 */
async function cargarPortadas(
  filas: FilaSeed[],
  vault: ReturnType<typeof vaultDe>,
  problemas: string[],
): Promise<void> {
  const conPortada = filas.filter((f) => typeof f.portada?.directUrl === "string");
  console.log(`\n  portadas: ${String(conPortada.length)} por descargar`);

  const existentes = await vault.listar({ limite: 1000 });
  const porTitulo = new Map(existentes.map((a) => [normalizarTitulo(a.titulo), a]));

  let hechas = 0;
  let saltadas = 0;

  for (let i = 0; i < conPortada.length; i += A_LA_VEZ) {
    const lote = conPortada.slice(i, i + A_LA_VEZ);

    await Promise.all(
      lote.map(async (fila) => {
        const anime = porTitulo.get(normalizarTitulo(fila.titulo));
        if (anime === undefined) {
          problemas.push(`${fila.titulo}: no se encontró el anime para su portada`);
          return;
        }

        // Ya tiene portada: no se vuelve a descargar. Idempotencia.
        if (anime.checksumPortada !== null) {
          saltadas += 1;
          return;
        }

        const url = fila.portada?.directUrl ?? "";
        const descarga = await descargarImagen(url);
        if (!descarga.ok) {
          problemas.push(`${fila.titulo}: descarga fallida (${descarga.motivo})`);
          return;
        }

        const procesada = await procesarPortada(descarga.bytes);
        if (!procesada.ok) {
          problemas.push(`${fila.titulo}: no es una imagen procesable`);
          return;
        }

        await vault.guardarPortada(anime.id, {
          ...procesada.portada,
          urlOrigen: descarga.urlFinal,
        });
        hechas += 1;
      }),
    );

    process.stdout.write(
      `\r    ${String(Math.min(i + A_LA_VEZ, conPortada.length))}/${String(conPortada.length)}`,
    );
  }

  console.log(`\n  portadas: ${String(hechas)} descargadas · ${String(saltadas)} ya estaban`);
}

function extraerFilas(bruto: unknown): FilaSeed[] {
  if (Array.isArray(bruto)) return bruto as FilaSeed[];
  if (typeof bruto === "object" && bruto !== null) {
    for (const valor of Object.values(bruto)) {
      if (Array.isArray(valor)) return valor as FilaSeed[];
    }
  }
  throw new Error("animes-seed.json no tiene la forma esperada: no se encuentra la lista.");
}

principal().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

/** Escribe el progreso de los animes que ya estaban y no lo tenían. */
async function rellenarProgresoQueFalte(
  filas: FilaSeed[],
  vault: ReturnType<typeof vaultDe>,
  problemas: string[],
): Promise<number> {
  const existentes = await vault.listar({ limite: 1000 });
  const porTitulo = new Map(existentes.map((a) => [normalizarTitulo(a.titulo), a]));

  let n = 0;
  for (const fila of filas) {
    const anime = porTitulo.get(normalizarTitulo(fila.titulo));
    if (anime === undefined || anime.progresoEtiqueta !== null) continue;

    const progreso = mapearProgresoDelSeed(fila.progresoTipo, fila.progresoEtiqueta);
    if ("desconocido" in progreso) {
      problemas.push(`${fila.titulo}: progreso desconocido «${progreso.tipo}»`);
      continue;
    }

    await vault.guardarProgreso(anime.id, {
      kind: progreso.kind,
      label: progreso.label,
      temporada: progreso.season,
    });
    n += 1;
  }
  return n;
}
