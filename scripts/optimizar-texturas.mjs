/**
 * Convierte las texturas del diseño a WebP y las deja en `public/texturas/`.
 *
 * POR QUÉ EXISTE: `design/` está excluido del despliegue (`.vercelignore`) —son
 * megabytes de originales que no se sirven nunca—, así que lo que la aplicación
 * usa tiene que vivir aparte y ya optimizado. Sin este paso, `background-image:
 * url(/texturas/laja-marco.webp)` da 404 en Vercel y el fondo desaparece: el
 * tipo de fallo que solo se ve en producción.
 *
 * Es IDEMPOTENTE: no reescribe un fichero cuyo origen no ha cambiado.
 *
 *   node scripts/optimizar-texturas.mjs
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const ORIGEN = join(process.cwd(), "design", "assets", "web");
const DESTINO = join(process.cwd(), "public", "texturas");

/** Las texturas se sirven bajo un velo de --void al 86-97 %: no necesitan más. */
const CALIDAD = 74;
const ANCHO_MAXIMO = 1920;

if (!existsSync(ORIGEN)) {
  console.error(`No existe ${ORIGEN}. ¿Está design/ en su sitio?`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

let hechas = 0;
let saltadas = 0;

for (const fichero of readdirSync(ORIGEN)) {
  if (!/\.(jpe?g|png)$/i.test(fichero)) continue;

  const entrada = join(ORIGEN, fichero);
  const salida = join(DESTINO, fichero.replace(/\.(jpe?g|png)$/i, ".webp"));

  if (existsSync(salida) && statSync(salida).mtimeMs >= statSync(entrada).mtimeMs) {
    saltadas += 1;
    continue;
  }

  const info = await sharp(entrada)
    .rotate() //                     respeta el EXIF antes de redimensionar
    .resize({ width: ANCHO_MAXIMO, withoutEnlargement: true })
    .webp({ quality: CALIDAD })
    // Sin metadatos: estas imágenes se sirven públicamente y el EXIF de un JPEG
    // puede llevar GPS. Es la misma razón que en el pipeline de portadas.
    .toFile(salida);

  const antes = statSync(entrada).size;
  console.log(
    `  ${fichero} → ${salida.split(/[\/]/).pop()}  ` +
      `${(antes / 1024).toFixed(0)} kB → ${(info.size / 1024).toFixed(0)} kB  ` +
      `(${info.width}×${info.height})`,
  );
  hechas += 1;
}

console.log(`\ntexturas: ${hechas} convertidas, ${saltadas} sin cambios.`);
