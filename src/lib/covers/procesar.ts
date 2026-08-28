import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE BYTES DESCONOCIDOS A DOS WEBP CONOCIDOS.
 *
 * ── EL RE-ENCODE NO ES UNA OPTIMIZACIÓN: ES UNA DEFENSA ────────────────────
 *
 * **Nunca se guarda el binario original.** Lo que entra aquí lo eligió el
 * usuario y lo sirvió un servidor cualquiera de internet, así que puede llevar
 * dentro cosas que no son una imagen: un SVG con `<script>`, un polyglot que es
 * a la vez JPEG y HTML, o simplemente el EXIF con las coordenadas GPS de la casa
 * de alguien.
 *
 * Sharp decodifica a píxeles y vuelve a codificar. Lo que sale es una imagen y
 * nada más: cualquier carga incrustada desaparece por construcción, no porque
 * la hayamos buscado.
 *
 * ── LOS MAGIC BYTES LOS COMPRUEBA SHARP, Y ES LO CORRECTO ──────────────────
 *
 * `Content-Type` es una cabecera, o sea texto que escribe quien sirve el
 * fichero. Aquí no se mira: si sharp no puede leerlo, no es una imagen, y da
 * igual lo que dijera la cabecera.
 *
 * ── TRAMPAS YA VERIFICADAS (`sharp-pipeline.test.ts`) ──────────────────────
 *
 * · `sharp.format.avif` es `undefined`. AVIF es un contenedor HEIF: un
 *   validador que compruebe `format === "avif"` **rechaza todas las portadas
 *   AVIF** que el contrato dice aceptar.
 * · Re-encodear NO propaga el EXIF del original. Eso destruye el GPS, y es una
 *   medida de seguridad además de de formato.
 * · Con una entrada que no es imagen, `metadata()` **rechaza la promesa**. Se
 *   captura y se traduce; nunca sube como un 500.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Medidas del contrato de dominio. No se cambian sin cambiar la skill. */
export const PORTADA = { ancho: 480, alto: 720 } as const;
export const MINIATURA = { ancho: 100, alto: 150 } as const;
const CALIDAD = 82;

export type PortadaProcesada = {
  /** WebP 480×720. Lo que sirve `/api/covers/[animeId]`. */
  bytes: Buffer;
  /** WebP 100×150 para la vista lista. */
  miniatura: Buffer;
  mime: "image/webp";
  ancho: number;
  alto: number;
  /** sha256 del ORIGINAL. Es la clave para no volver a descargar lo mismo. */
  checksum: string;
};

export type FalloProceso = "NO_ES_IMAGEN";

export type ResultadoProceso =
  { ok: true; portada: PortadaProcesada } | { ok: false; motivo: FalloProceso };

/**
 * sha256 del binario **original**, no del procesado.
 *
 * Es lo que permite saltarse el trabajo: si el usuario vuelve a pegar la misma
 * URL, el original coincide y no hace falta ni descargar ni reprocesar. Sobre el
 * procesado no serviría, porque para calcularlo habría que procesar.
 */
export function checksumDe(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function procesarPortada(original: Buffer): Promise<ResultadoProceso> {
  try {
    // `.rotate()` sin argumentos aplica la orientación del EXIF ANTES de
    // redimensionar. Sin él, una foto tomada en vertical con el móvil se
    // guardaría girada, y el recorte 2:3 cortaría por donde no toca.
    const base = sharp(original).rotate();

    // Que `metadata()` no rechace es la comprobación de que ESTO ES UNA IMAGEN.
    // No se mira el `format` concreto a propósito: AVIF se reporta como `heif`,
    // y comprobar el nombre rechazaría un formato que el contrato acepta.
    await base.metadata();

    const bytes = await base
      .clone()
      .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover", position: "attention" })
      .webp({ quality: CALIDAD })
      .toBuffer();

    const miniatura = await base
      .clone()
      .resize(MINIATURA.ancho, MINIATURA.alto, { fit: "cover", position: "attention" })
      .webp({ quality: CALIDAD })
      .toBuffer();

    return {
      ok: true,
      portada: {
        bytes,
        miniatura,
        mime: "image/webp",
        ancho: PORTADA.ancho,
        alto: PORTADA.alto,
        checksum: checksumDe(original),
      },
    };
  } catch {
    // Un PDF, un HTML, un fichero truncado, un SVG malicioso… todo lo mismo.
    // El detalle del error de libvips no le sirve a nadie y puede filtrar rutas.
    return { ok: false, motivo: "NO_ES_IMAGEN" };
  }
}
