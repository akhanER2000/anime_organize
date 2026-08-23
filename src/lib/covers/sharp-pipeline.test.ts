/**
 * Prueba de humo del pipeline de imagen.
 *
 * POR QUÉ EXISTE ESTE TEST: `package.json` fuerza `sharp@^0.35.3` mediante
 * `overrides`, por encima del `^0.34.3` que declara Next 15 como
 * optionalDependency. Ese override elimina las CVEs de libvips heredadas, pero
 * `npm audit` en verde NO demuestra que sharp siga funcionando: es exactamente
 * el caso en el que la auditoría queda limpia y el procesado de imágenes revienta
 * en build o en runtime.
 *
 * Si este test falla, la decisión correcta es revertir el override de sharp y
 * documentar la vulnerabilidad con un TODO — nunca dejar una app que no procesa
 * portadas.
 *
 * Cubre además el contrato de portadas de `anime-vault-domain` §5:
 * WebP calidad 82, portada 480x720 (cover) y miniatura 100x150.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";

/** Dimensiones fijadas por el contrato de portadas. No son negociables. */
const PORTADA = { ancho: 480, alto: 720 } as const;
const MINIATURA = { ancho: 100, alto: 150 } as const;
const CALIDAD_WEBP = 82;

/** Primeros bytes de un WebP: "RIFF" .... "WEBP". */
function esWebpValido(buf: Buffer): boolean {
  return (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

/**
 * Genera una imagen de prueba con contenido real (no un lienzo plano, que
 * comprime a casi nada y escondería fallos del codificador).
 */
async function imagenDePrueba(
  ancho: number,
  alto: number,
  formato: "jpeg" | "png",
): Promise<Buffer> {
  const canal = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < ancho * alto; i += 1) {
    const x = i % ancho;
    const y = Math.floor(i / ancho);
    canal[i * 3] = (x * 7) % 256;
    canal[i * 3 + 1] = (y * 11) % 256;
    canal[i * 3 + 2] = ((x ^ y) * 13) % 256;
  }
  const base = sharp(canal, { raw: { width: ancho, height: alto, channels: 3 } });
  return formato === "jpeg" ? base.jpeg().toBuffer() : base.png().toBuffer();
}

describe("sharp · el binario nativo carga y funciona", () => {
  it("expone libvips y el códec WebP en ambos sentidos", () => {
    expect(sharp.versions.vips).toBeTruthy();
    expect(sharp.format.webp.input.buffer).toBe(true);
    expect(sharp.format.webp.output.buffer).toBe(true);
  });

  it("está en la versión que fuerza el override, no en la de Next", async () => {
    const { default: pkg } = await import("../../../node_modules/sharp/package.json", {
      with: { type: "json" },
    });
    expect(pkg.version.startsWith("0.35.")).toBe(true);
  });
});

describe("pipeline de portada · JPEG de origen", () => {
  it("produce un WebP válido de exactamente 480x720", async () => {
    const origen = await imagenDePrueba(1000, 1400, "jpeg");

    const salida = await sharp(origen)
      .rotate()
      .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover" })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    expect(esWebpValido(salida)).toBe(true);

    const meta = await sharp(salida).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(PORTADA.ancho);
    expect(meta.height).toBe(PORTADA.alto);
    expect(salida.byteLength).toBeGreaterThan(0);
  });

  it("recorta con `cover` en vez de deformar una imagen cuadrada", async () => {
    // Una portada es 2:3 SIN EXCEPCIÓN. Una imagen cuadrada se recorta, no se estira.
    const cuadrada = await imagenDePrueba(800, 800, "jpeg");

    const salida = await sharp(cuadrada)
      .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover" })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    const meta = await sharp(salida).metadata();
    expect(meta.width).toBe(PORTADA.ancho);
    expect(meta.height).toBe(PORTADA.alto);
    expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(2 / 3, 5);
  });

  it("amplía una imagen más pequeña que el objetivo", async () => {
    const pequena = await imagenDePrueba(120, 180, "jpeg");

    const salida = await sharp(pequena)
      .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover" })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    const meta = await sharp(salida).metadata();
    expect(meta.width).toBe(PORTADA.ancho);
    expect(meta.height).toBe(PORTADA.alto);
  });
});

describe("pipeline de miniatura", () => {
  it("produce un WebP válido de exactamente 100x150", async () => {
    const origen = await imagenDePrueba(1000, 1400, "png");

    const salida = await sharp(origen)
      .resize(MINIATURA.ancho, MINIATURA.alto, { fit: "cover" })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    expect(esWebpValido(salida)).toBe(true);

    const meta = await sharp(salida).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(MINIATURA.ancho);
    expect(meta.height).toBe(MINIATURA.alto);
  });

  it("la miniatura pesa bastante menos que la portada", async () => {
    const origen = await imagenDePrueba(1000, 1400, "png");
    const opciones = { fit: "cover" } as const;

    const portada = await sharp(origen)
      .resize(PORTADA.ancho, PORTADA.alto, opciones)
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();
    const miniatura = await sharp(origen)
      .resize(MINIATURA.ancho, MINIATURA.alto, opciones)
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    expect(miniatura.byteLength).toBeLessThan(portada.byteLength);
  });
});

describe("formatos de entrada admitidos por el contrato", () => {
  it.each(["jpeg", "png", "webp"] as const)("acepta %s como entrada", (formato) => {
    expect(sharp.format[formato].input.buffer).toBe(true);
  });

  it("acepta AVIF, que sharp agrupa bajo `heif`", () => {
    // AVIF es un contenedor de la familia HEIF: sharp NO expone `sharp.format.avif`,
    // y sus TIPOS tampoco lo declaran (`FormatEnum` no tiene la clave). Por eso la
    // comprobación va con `in` y no con acceso directo: escribir
    // `sharp.format.avif` es un error de compilación, que es la mejor prueba de
    // que la trampa es real.
    expect("avif" in sharp.format).toBe(false);
    expect(sharp.format.heif.input.buffer).toBe(true);
  });

  it("un AVIF se identifica como `heif` en metadata().format", async () => {
    // TRAMPA PARA LA FASE 2: la validación de /api/covers acepta image/avif, pero
    // si comprueba `metadata.format === "avif"` rechaza TODAS las portadas AVIF.
    // El formato correcto a esperar es "heif"; el mime de salida se decide por el
    // códec que pedimos nosotros (siempre WebP), no por el del origen.
    const origen = await imagenDePrueba(300, 450, "png");
    const comoAvif = await sharp(origen).avif({ effort: 0 }).toBuffer();

    const meta = await sharp(comoAvif).metadata();
    expect(meta.format).toBe("heif");

    // Y sus magic bytes son la caja `ftyp` con marca `avif`, que es lo que hay
    // que comprobar de verdad: una cabecera Content-Type la controla el atacante.
    expect(comoAvif.toString("ascii", 4, 8)).toBe("ftyp");
    expect(comoAvif.toString("ascii", 8, 12)).toBe("avif");
  });

  it("convierte los cuatro formatos de entrada a WebP 480x720", async () => {
    const base = await imagenDePrueba(600, 900, "png");

    const entradas = {
      jpeg: await sharp(base).jpeg().toBuffer(),
      png: await sharp(base).png().toBuffer(),
      webp: await sharp(base).webp().toBuffer(),
      avif: await sharp(base).avif({ effort: 0 }).toBuffer(),
    };

    for (const [nombre, buf] of Object.entries(entradas)) {
      const salida = await sharp(buf)
        .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover" })
        .webp({ quality: CALIDAD_WEBP })
        .toBuffer();

      const meta = await sharp(salida).metadata();
      expect(meta.format, `origen ${nombre}`).toBe("webp");
      expect(meta.width, `origen ${nombre}`).toBe(PORTADA.ancho);
      expect(meta.height, `origen ${nombre}`).toBe(PORTADA.alto);
    }
  }, 30_000);
});

describe("sharp como medida de seguridad, no solo de formato", () => {
  it("no propaga los metadatos EXIF del original", async () => {
    // Un EXIF puede llevar GPS. Re-encodear destruye esos datos.
    const conExif = await sharp(await imagenDePrueba(600, 900, "jpeg"))
      .withMetadata({ exif: { IFD0: { Copyright: "prueba", Artist: "prueba" } } })
      .jpeg()
      .toBuffer();

    const salida = await sharp(conExif)
      .rotate()
      .resize(PORTADA.ancho, PORTADA.alto, { fit: "cover" })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();

    const meta = await sharp(salida).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("rechaza un buffer que no es una imagen", async () => {
    // Un fichero con Content-Type: image/png pero contenido de otra cosa.
    const impostor = Buffer.from("PKesto es un zip, no una imagen", "utf-8");
    await expect(sharp(impostor).metadata()).rejects.toThrow();
  });
});
