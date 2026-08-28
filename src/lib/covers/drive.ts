import { createSign, randomBytes } from "node:crypto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ESPEJO DE PORTADAS EN GOOGLE DRIVE — lote C4, encargo §5.
 *
 * ── ES UN ESPEJO, NO EL ALMACENAMIENTO ──────────────────────────────────
 *
 * La skill de dominio §5 lo dice en su primera línea: «la URL es solo el
 * origen, nunca el almacenamiento. **La fuente de verdad son los bytes en
 * Postgres. Drive es un espejo opcional**». Y añade la consecuencia que
 * gobierna todo este fichero: «**si Drive falla, la app sigue funcionando**: se
 * registra el aviso y se continúa».
 *
 * Por eso nada de aquí lanza hacia arriba y nada de aquí bloquea una portada.
 * Subir a Drive es lo último que pasa, después de que los bytes estén ya
 * guardados y servibles.
 *
 * ── POR QUÉ NO SE INSTALA `googleapis` ──────────────────────────────────
 *
 * Porque son dos peticiones HTTP y una firma. `googleapis` trae el cliente
 * generado de **todas** las APIs de Google —decenas de megabytes— para usar dos
 * endpoints, y cada dependencia en una función serverless es arranque en frío y
 * superficie que auditar. Con `node:crypto` y `fetch` son ciento y pico líneas
 * que se leen enteras.
 *
 * ── EL PERMISO ES EL MÍNIMO, Y ESO IMPORTA ──────────────────────────────
 *
 * `drive.file` da acceso **sólo a los ficheros que crea esta aplicación**. Con
 * `drive` a secas, una credencial filtrada abriría el Drive entero del dueño —
 * sus documentos, sus fotos, todo—. La diferencia son dos palabras en un
 * `scope` y es la diferencia entre un incidente y una catástrofe.
 *
 * ── ESTADO HONESTO: ESCRITO, NO EJECUTADO ───────────────────────────────
 *
 * En este entorno **no hay cuenta de servicio**, así que la subida real no se ha
 * ejercitado nunca. Lo que sí está probado es todo lo que se decide antes de
 * tocar la red —la configuración, la clave, las reclamaciones del JWT y el
 * cuerpo multiparte—, que es donde están los fallos silenciosos.
 *
 * El día que haya credenciales, lo que hay que comprobar es una sola cosa: que
 * `anime_cover.drive_file_id` deja de ser nulo. Está escrito en el runbook.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ENDPOINT_TOKEN = "https://oauth2.googleapis.com/token";
const ENDPOINT_SUBIDA = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

/** Sólo los ficheros que crea esta aplicación. Ver la cabecera. */
const ALCANCE = "https://www.googleapis.com/auth/drive.file";

/** Una hora es el máximo que Google acepta para un JWT de cuenta de servicio. */
const VIDA_DEL_TOKEN_S = 3600;

/** 15 s: es una subida de ~100 KB a un servicio que suele responder en menos de 1. */
const TIMEOUT_MS = 15_000;

export type ConfiguracionDrive =
  | { readonly estado: "APAGADO" }
  | { readonly estado: "INCOMPLETO"; readonly faltan: readonly string[] }
  | {
      readonly estado: "LISTO";
      readonly carpeta: string;
      readonly cliente: string;
      readonly clave: string;
    };

const VARIABLES = [
  "GOOGLE_DRIVE_FOLDER_ID",
  "GOOGLE_DRIVE_CLIENT_EMAIL",
  "GOOGLE_DRIVE_PRIVATE_KEY",
] as const;

/**
 * Qué hay configurado. **Tres estados, no dos.**
 *
 * «Apagado» y «a medias» son cosas distintas y confundirlas es el fallo clásico
 * de la configuración opcional: el dueño pone dos de las tres variables, la app
 * decide que «no quiere Drive» y no vuelve a mencionarlo nunca. `security.md`
 * pide lo contrario: la configuración falla en voz alta.
 */
export function configuracionDeDrive(
  entorno: Readonly<Record<string, string | undefined>>,
): ConfiguracionDrive {
  const valor = (nombre: string): string | null => {
    const bruto = entorno[nombre];
    return bruto === undefined || bruto.trim() === "" ? null : bruto.trim();
  };

  const puestas = VARIABLES.filter((v) => valor(v) !== null);
  if (puestas.length === 0) return { estado: "APAGADO" };

  if (puestas.length < VARIABLES.length) {
    return { estado: "INCOMPLETO", faltan: VARIABLES.filter((v) => valor(v) === null) };
  }

  return {
    estado: "LISTO",
    carpeta: valor("GOOGLE_DRIVE_FOLDER_ID") ?? "",
    cliente: valor("GOOGLE_DRIVE_CLIENT_EMAIL") ?? "",
    clave: normalizarClavePrivada(valor("GOOGLE_DRIVE_PRIVATE_KEY") ?? ""),
  };
}

/**
 * La clave PEM, tal y como sobrevive a una variable de entorno.
 *
 * Un PEM lleva saltos de línea y las variables de entorno no, así que viaja con
 * `\n` escapados. Sin deshacerlos, `crypto` la rechaza con un error que se lee
 * como «la clave está mal» y sólo es un formato — y a veces con comillas
 * pegadas, porque el panel de Vercel las conserva si se copian.
 */
export function normalizarClavePrivada(bruta: string): string {
  return bruta.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

export type ReclamacionesToken = {
  readonly iss: string;
  readonly scope: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
};

export function reclamacionesDelToken(cliente: string, ahora: Date): ReclamacionesToken {
  const iat = Math.floor(ahora.getTime() / 1000);
  return {
    iss: cliente,
    scope: ALCANCE,
    // El JWT va dirigido al endpoint de TOKEN, no a la API. Un `aud`
    // equivocado devuelve un 400 sin explicación útil.
    aud: ENDPOINT_TOKEN,
    iat,
    exp: iat + VIDA_DEL_TOKEN_S,
  };
}

function base64url(datos: Buffer | string): string {
  return Buffer.from(datos)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** El JWT firmado con RS256, que es lo único que Google acepta aquí. */
function firmarJwt(reclamaciones: ReclamacionesToken, clavePrivada: string): string {
  const cabecera = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = base64url(JSON.stringify(reclamaciones));

  const firma = createSign("RSA-SHA256").update(`${cabecera}.${cuerpo}`).sign(clavePrivada);

  return `${cabecera}.${cuerpo}.${base64url(firma)}`;
}

export type CuerpoMultiparte = { readonly cuerpo: Buffer; readonly frontera: string };

/**
 * El cuerpo `multipart/related` que espera la subida de Drive.
 *
 * Los metadatos van PRIMERO y los bytes después: Drive lee las partes en orden
 * y con el binario delante rechaza la petición.
 *
 * La frontera se genera **por subida**. Una fija que apareciera dentro de los
 * bytes de una imagen partiría el cuerpo por la mitad y subiría un fichero
 * corrupto sin dar error; con 16 bytes aleatorios, la probabilidad deja de ser
 * algo en lo que pensar.
 */
export function cuerpoMultiparte(
  metadatos: Record<string, unknown>,
  bytes: Buffer,
  mime: string,
): CuerpoMultiparte {
  const frontera = `anime-vault-${randomBytes(16).toString("hex")}`;

  const cabecera = Buffer.from(
    `--${frontera}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadatos)}\r\n` +
      `--${frontera}\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
    "utf8",
  );

  const cierre = Buffer.from(`\r\n--${frontera}--`, "utf8");

  return { cuerpo: Buffer.concat([cabecera, bytes, cierre]), frontera };
}

export type ResultadoEspejo =
  | { readonly ok: true; readonly driveFileId: string }
  | { readonly ok: false; readonly motivo: "APAGADO" }
  | { readonly ok: false; readonly motivo: "INCOMPLETO"; readonly faltan: readonly string[] }
  | { readonly ok: false; readonly motivo: "FALLO"; readonly detalle: string };

async function pedirToken(config: {
  cliente: string;
  clave: string;
}): Promise<{ ok: true; token: string } | { ok: false; detalle: string }> {
  const aserto = firmarJwt(reclamacionesDelToken(config.cliente, new Date()), config.clave);

  let respuesta: Response;
  try {
    respuesta = await fetch(ENDPOINT_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: aserto,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, detalle: "no se pudo pedir el token" };
  }

  if (!respuesta.ok) return { ok: false, detalle: `token: HTTP ${String(respuesta.status)}` };

  const crudo: unknown = await respuesta.json().catch(() => null);
  const token =
    typeof crudo === "object" && crudo !== null && "access_token" in crudo
      ? (crudo as { access_token?: unknown }).access_token
      : undefined;

  if (typeof token !== "string" || token === "") {
    return { ok: false, detalle: "el token vino sin `access_token`" };
  }

  return { ok: true, token };
}

/**
 * Sube una portada al espejo. **Nunca lanza.**
 *
 * Un fallo aquí no puede tumbar el guardado de una portada que ya está en
 * Postgres y ya se sirve: la app funciona sin Drive por diseño. Se devuelve el
 * motivo para poder registrarlo, y quien llama sigue.
 */
export async function subirAlEspejo(
  nombre: string,
  bytes: Buffer,
  mime: string,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ResultadoEspejo> {
  const config = configuracionDeDrive(entorno);

  if (config.estado === "APAGADO") return { ok: false, motivo: "APAGADO" };
  if (config.estado === "INCOMPLETO") {
    return { ok: false, motivo: "INCOMPLETO", faltan: config.faltan };
  }

  const token = await pedirToken(config);
  if (!token.ok) return { ok: false, motivo: "FALLO", detalle: token.detalle };

  const { cuerpo, frontera } = cuerpoMultiparte(
    { name: nombre, parents: [config.carpeta] },
    bytes,
    mime,
  );

  let respuesta: Response;
  try {
    respuesta = await fetch(ENDPOINT_SUBIDA, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "content-type": `multipart/related; boundary=${frontera}`,
      },
      body: new Uint8Array(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, motivo: "FALLO", detalle: "no se pudo subir" };
  }

  if (!respuesta.ok) {
    return { ok: false, motivo: "FALLO", detalle: `subida: HTTP ${String(respuesta.status)}` };
  }

  const crudo: unknown = await respuesta.json().catch(() => null);
  const id =
    typeof crudo === "object" && crudo !== null && "id" in crudo
      ? (crudo as { id?: unknown }).id
      : undefined;

  if (typeof id !== "string" || id === "") {
    return { ok: false, motivo: "FALLO", detalle: "la subida no devolvió un id" };
  }

  return { ok: true, driveFileId: id };
}
