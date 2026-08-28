import * as XLSX from "xlsx";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEER LA HOJA QUE SUBE EL USUARIO.
 *
 * ── POR MAGIC BYTES, NUNCA POR EXTENSIÓN ────────────────────────────────
 *
 * `security.md` §8. La extensión la escribe quien sube el fichero; los
 * primeros bytes los escribió quien lo generó. Un `.csv` que empieza por
 * `89 50 4E 47` es un PNG con otro nombre, y dárselo a un parser es regalarle
 * a un tercero la elección del formato.
 *
 * ── QUÉ SE ACEPTA, Y QUÉ NO AUNQUE SE PUEDA ─────────────────────────────
 *
 * | formato | magic | se acepta |
 * |---|---|---|
 * | `.xlsx` | `50 4B 03 04` (ZIP) | sí |
 * | `.csv` | (texto) | sí |
 * | `.xls` viejo | `D0 CF 11 E0` | **no**, aunque SheetJS lo lea |
 *
 * El `.xls` antiguo es un contenedor OLE: formato binario, con macros y con
 * mucha más superficie que un ZIP con XML dentro. No se rechaza por no poder
 * leerlo — se rechaza por no querer parsearlo.
 *
 * ── DE DÓNDE SALE EL PAQUETE ────────────────────────────────────────────
 *
 * De `cdn.sheetjs.com`, **no del registro de npm**. El `xlsx` del registro está
 * congelado en 0.18.5 desde que SheetJS se mudó, y esa versión arrastra
 * CVE-2023-30533 (prototype pollution) y una ReDoS. La distribución oficial es
 * el tarball de su CDN, que es lo que declara `package.json`. Una URL en las
 * dependencias llama la atención, y por eso está escrito aquí.
 *
 * ── EL TOPE SE MIDE EN BYTES, ANTES DE PARSEAR ──────────────────────────
 *
 * Igual que en el pipeline de portadas: **un ZIP pequeño puede descomprimirse
 * en gigas**. Contar filas ya sería tarde, porque para contarlas hay que
 * haberlo descomprimido.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 5 MiB. Una lista de miles de series ocupa muy por debajo de esto. */
export const MAXIMO_BYTES_HOJA = 5 * 1024 * 1024;

/** Tope de filas de datos. Por encima, se corta Y SE DICE. */
export const MAXIMO_FILAS = 5000;

export type TipoDeHoja = "XLSX" | "CSV";

const ZIP = [0x50, 0x4b, 0x03, 0x04];

function empiezaPor(datos: Buffer, bytes: readonly number[]): boolean {
  if (datos.length < bytes.length) return false;
  return bytes.every((b, i) => datos[i] === b);
}

/**
 * Qué es esto, mirando los bytes. `null` = no se acepta.
 *
 * El CSV no tiene magic bytes porque es texto plano, así que se comprueba lo
 * contrario: que **no lleve bytes nulos** y que decodifique como UTF-8. Un
 * binario cualquiera falla por lo primero casi siempre, y los que no fallan por
 * ahí fallarán al parsear como hoja.
 */
export function detectarTipo(datos: Buffer): TipoDeHoja | null {
  if (datos.length === 0) return null;
  if (empiezaPor(datos, ZIP)) return "XLSX";

  // Se mira una muestra: recorrer 5 MiB buscando un cero no aporta nada que no
  // diga la cabecera.
  const muestra = datos.subarray(0, Math.min(datos.length, 8192));
  if (muestra.includes(0)) return null;

  const texto = muestra.toString("utf8");
  // El carácter de reemplazo aparece cuando los bytes no son UTF-8 válido.
  if (texto.includes("�")) return null;

  return "CSV";
}

export type FalloDeHoja = "TIPO_NO_SOPORTADO" | "DEMASIADO_GRANDE" | "HOJA_VACIA" | "ILEGIBLE";

export type HojaLeida = {
  readonly ok: true;
  readonly tipo: TipoDeHoja;
  readonly cabeceras: readonly unknown[];
  readonly filas: readonly (readonly unknown[])[];
  /** `true` si se pasó de `MAXIMO_FILAS` y se cortó. Se enseña SIEMPRE. */
  readonly recortada: boolean;
};

export type ResultadoHoja = HojaLeida | { readonly ok: false; readonly motivo: FalloDeHoja };

/** ¿Tiene algo esta fila, o son celdas vacías de Excel? */
function tieneContenido(fila: readonly unknown[]): boolean {
  return fila.some((celda) => {
    if (celda === null || celda === undefined) return false;
    if (typeof celda === "string") return celda.trim() !== "";
    return true;
  });
}

export function leerHoja(datos: Buffer): ResultadoHoja {
  // El tamaño, ANTES de tocar el parser.
  if (datos.byteLength > MAXIMO_BYTES_HOJA) return { ok: false, motivo: "DEMASIADO_GRANDE" };

  const tipo = detectarTipo(datos);
  if (tipo === null) return { ok: false, motivo: "TIPO_NO_SOPORTADO" };

  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(datos, {
      type: "buffer",
      // Las fórmulas NO se leen: sólo interesa el valor que el usuario ve, y
      // arrastrar fórmulas es arrastrar una superficie que no se usa.
      cellFormula: false,
      cellHTML: false,
      // Las fechas como `Date` en vez de como número de serie de Excel, que es
      // lo que produce «45000» donde debería poner una fecha.
      cellDates: true,
    });
  } catch {
    // Nunca una excepción hacia arriba: un fichero corrupto es un resultado.
    return { ok: false, motivo: "ILEGIBLE" };
  }

  const nombre = libro.SheetNames[0];
  const hoja = nombre === undefined ? undefined : libro.Sheets[nombre];
  if (hoja === undefined) return { ok: false, motivo: "HOJA_VACIA" };

  // `header: 1` devuelve filas como arrays, que es lo que necesita el mapeo por
  // posición. Con objetos, dos columnas con la misma cabecera se pisarían.
  const todas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    blankrows: false,
    // `defval` para que una celda vacía en medio no descuadre las posiciones.
    defval: null,
    raw: true,
  });

  const conContenido = todas.filter(tieneContenido);
  const [cabeceras, ...cuerpo] = conContenido;

  if (cabeceras === undefined || cuerpo.length === 0) return { ok: false, motivo: "HOJA_VACIA" };

  return {
    ok: true,
    tipo,
    cabeceras,
    filas: cuerpo.slice(0, MAXIMO_FILAS),
    recortada: cuerpo.length > MAXIMO_FILAS,
  };
}
