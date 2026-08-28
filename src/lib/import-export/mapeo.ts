import { mapearEstado } from "@/lib/domain/enums";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE UNA HOJA AJENA A LOS CAMPOS DE ESTE VAULT.
 *
 * ── LA HOJA LA HIZO UNA PERSONA ──────────────────────────────────────────
 *
 * No es un fichero de intercambio: es la lista que alguien llevaba en Excel.
 * Las cabeceras vienen en dos idiomas, con acentos, con mayúsculas de todas las
 * formas y con espacios de más; las columnas están en cualquier orden y la
 * mitad no existen.
 *
 * Adivinar mal la columna del título significa importar trescientas filas con
 * el nombre equivocado, así que la detección se hace contra una lista explícita
 * de sinónimos y **lo que no se reconoce se deja sin mapear** — no se adivina
 * por posición.
 *
 * ── EL USUARIO SIEMPRE PUEDE CORREGIRLO ─────────────────────────────────
 *
 * Esto sólo propone. La pantalla de importación enseña el mapeo detectado y
 * deja cambiarlo antes de escribir nada, porque una detección automática que no
 * se puede corregir es peor que ninguna.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los sinónimos de cada campo. Todos ya normalizados (minúsculas, sin acentos). */
export const COLUMNAS = {
  titulo: ["titulo", "title", "nombre", "anime", "serie", "obra"],
  estado: ["estado", "status", "estado original", "situacion"],
  progreso: ["progreso", "progress", "avance", "episodio", "capitulo", "visto hasta"],
  notas: ["notas", "notes", "comentario", "comentarios", "observaciones"],
  favorito: ["favorito", "favourite", "favorite", "fav", "estrella"],
  portada: ["portada", "cover", "imagen", "url portada", "caratula"],
  enlace: ["enlace", "link", "url", "donde ver", "continuar"],
} as const;

export type CampoImportable = keyof typeof COLUMNAS;

/** Qué columna de la hoja alimenta cada campo. `null` = la hoja no la trae. */
export type MapaDeColumnas = Readonly<Record<CampoImportable, number | null>>;

/** Minúsculas, sin acentos y sin espacios sobrantes. Como los títulos. */
function normalizar(valor: string): string {
  return valor
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Propone un mapeo a partir de la fila de cabeceras.
 *
 * Con dos candidatas gana **la primera**: una hoja exportada de otra app trae
 * `Título` y `Título original` a menudo, y quedarse con la última importaría el
 * nombre japonés como título principal.
 */
export function detectarColumnas(cabeceras: readonly unknown[]): MapaDeColumnas {
  const limpias = cabeceras.map((c) => (typeof c === "string" ? normalizar(c) : ""));

  const buscar = (campo: CampoImportable): number | null => {
    const sinonimos: readonly string[] = COLUMNAS[campo];
    const i = limpias.findIndex((cabecera) => cabecera !== "" && sinonimos.includes(cabecera));
    return i === -1 ? null : i;
  };

  return {
    titulo: buscar("titulo"),
    estado: buscar("estado"),
    progreso: buscar("progreso"),
    notas: buscar("notas"),
    favorito: buscar("favorito"),
    portada: buscar("portada"),
    enlace: buscar("enlace"),
  };
}

/** El tope del título. La columna es `text`, pero 500 caracteres ya no es un título. */
export const MAXIMO_TITULO = 500;

const AFIRMATIVOS = new Set(["si", "s", "x", "1", "true", "verdadero", "yes", "y", "✓"]);

export type FilaLeida = {
  readonly titulo: string;
  readonly estado: Estado;
  readonly progreso: string | null;
  readonly notas: string | null;
  readonly esFavorito: boolean;
  readonly portada: string | null;
  readonly enlace: string | null;
  /** Impiden importar la fila. */
  readonly errores: readonly string[];
  /** No la impiden, pero el usuario debe saberlos. */
  readonly avisos: readonly string[];
};

/** Una celda puede llegar como número, fecha o booleano. Todo acaba en texto. */
function celda(fila: readonly unknown[], indice: number | null): string | null {
  if (indice === null) return null;
  const bruto = fila[indice];
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto === "string") {
    const limpio = bruto.trim();
    return limpio === "" ? null : limpio;
  }
  if (typeof bruto === "number" || typeof bruto === "boolean") return String(bruto);
  if (bruto instanceof Date) return bruto.toISOString().slice(0, 10);
  return null;
}

export function leerFila(fila: readonly unknown[], mapa: MapaDeColumnas): FilaLeida {
  const errores: string[] = [];
  const avisos: string[] = [];

  const titulo = celda(fila, mapa.titulo) ?? "";
  if (titulo === "") errores.push("Falta el título");
  else if (titulo.length > MAXIMO_TITULO) {
    // Se marca, no se recorta: recortar en silencio guarda un título que el
    // usuario no escribió y que ya no coincide con nada de su lista.
    errores.push(`El título pasa de ${String(MAXIMO_TITULO)} caracteres`);
  }

  const estadoBruto = celda(fila, mapa.estado);
  const estado = mapearEstado(estadoBruto);
  // Sólo se avisa si la hoja PROMETÍA un estado y no se entendió. Una hoja sin
  // columna de estado no tiene nada que avisar.
  if (estadoBruto !== null && !estado.reconocido) {
    avisos.push(`estado «${estadoBruto}» no reconocido, se importa como Pendiente`);
  }

  const favoritoBruto = celda(fila, mapa.favorito);

  return {
    titulo,
    estado: estado.estado,
    progreso: celda(fila, mapa.progreso),
    notas: celda(fila, mapa.notas),
    esFavorito: favoritoBruto !== null && AFIRMATIVOS.has(normalizar(favoritoBruto)),
    portada: celda(fila, mapa.portada),
    enlace: celda(fila, mapa.enlace),
    errores,
    avisos,
  };
}
