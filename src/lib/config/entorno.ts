/**
 * Lectura y validación del entorno.
 *
 * PRINCIPIO: **un control de seguridad nunca falla hacia abierto en silencio.**
 *
 * Si alguien escribe `AUTH_REQUIRE_EMAIL_VERIFICATION=si` en vez de `true`, la
 * opción anterior —tratar cualquier cosa que no sea "true" como false— dejaba la
 * verificación de email desactivada sin decir nada. El despliegue arrancaba
 * verde y la protección no existía.
 *
 * Ahora una variable booleana solo admite `"true"` o `"false"` (sin distinguir
 * mayúsculas, con espacios recortados). Cualquier otra cosa **lanza y revienta el
 * arranque**. Que el despliegue falle ruidosamente es preferible a que un control
 * quede apagado por una errata.
 *
 * Módulo puro: no importa `server-only` para poder testearlo directamente, pero
 * solo debe usarse desde el servidor.
 */

/** Error de configuración. Se distingue de un error de negocio a propósito. */
export class ErrorConfiguracion extends Error {
  override readonly name = "ErrorConfiguracion";

  constructor(
    readonly variable: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Valores aceptados para un booleano de entorno. Nada más. */
const VERDADEROS = new Set(["true"]);
const FALSOS = new Set(["false"]);

/**
 * Lee una variable booleana.
 *
 * @throws {ErrorConfiguracion} si el valor no es exactamente `true` o `false`.
 */
export function booleano(
  variable: string,
  opciones: { porDefecto: boolean; entorno?: NodeJS.ProcessEnv },
): boolean {
  const env = opciones.entorno ?? process.env;
  const bruto = env[variable];

  // Ausente o vacía: se usa el valor por defecto documentado. Eso es distinto de
  // estar mal escrita, y no es un error.
  if (bruto === undefined || bruto.trim().length === 0) {
    return opciones.porDefecto;
  }

  const valor = bruto.trim().toLowerCase();

  if (VERDADEROS.has(valor)) return true;
  if (FALSOS.has(valor)) return false;

  throw new ErrorConfiguracion(
    variable,
    `${variable} tiene el valor ${JSON.stringify(bruto)}, que no es válido.\n` +
      `Solo se aceptan "true" o "false".\n` +
      `\n` +
      `Esto revienta el arranque a propósito: si se tratara como "false", el ` +
      `control quedaría desactivado sin que nadie se enterase. Corrige el valor ` +
      `en .env.local o en las variables de entorno del despliegue.`,
  );
}

/**
 * Lee una variable de texto obligatoria.
 *
 * @throws {ErrorConfiguracion} si falta o está vacía.
 */
export function textoObligatorio(
  variable: string,
  opciones?: { entorno?: NodeJS.ProcessEnv; pista?: string },
): string {
  const env = opciones?.entorno ?? process.env;
  const valor = env[variable]?.trim();

  if (valor === undefined || valor.length === 0) {
    throw new ErrorConfiguracion(
      variable,
      `Falta la variable de entorno ${variable}.` +
        (opciones?.pista !== undefined ? `\n${opciones.pista}` : "") +
        `\nVer .env.example.`,
    );
  }

  return valor;
}

/** Lee una variable de texto opcional. Vacío y solo-espacios cuentan como ausente. */
export function textoOpcional(variable: string, entorno?: NodeJS.ProcessEnv): string | undefined {
  const valor = (entorno ?? process.env)[variable]?.trim();
  return valor !== undefined && valor.length > 0 ? valor : undefined;
}

/**
 * Lee un entero positivo.
 *
 * @throws {ErrorConfiguracion} si no es un entero válido.
 */
export function entero(
  variable: string,
  opciones: { porDefecto: number; minimo?: number; entorno?: NodeJS.ProcessEnv },
): number {
  const bruto = textoOpcional(variable, opciones.entorno);
  if (bruto === undefined) return opciones.porDefecto;

  // Number() en vez de parseInt(): parseInt("10abc") devuelve 10 en silencio, que
  // es exactamente el tipo de tolerancia que queremos evitar aquí.
  const valor = Number(bruto);
  const minimo = opciones.minimo ?? 0;

  if (!Number.isInteger(valor) || valor < minimo) {
    throw new ErrorConfiguracion(
      variable,
      `${variable} tiene el valor ${JSON.stringify(bruto)}, que no es un entero >= ${minimo}.`,
    );
  }

  return valor;
}

// ---------------------------------------------------------------------------
// Banderas del proyecto
// ---------------------------------------------------------------------------

/**
 * TODAS las variables booleanas del proyecto viven aquí, en un solo sitio.
 *
 * Se validan juntas en el arranque (`validarEntorno`) para que una errata salga
 * a la primera y no la primera vez que alguien intenta registrarse.
 */
export const BANDERAS = [
  {
    variable: "AUTH_REQUIRE_EMAIL_VERIFICATION",
    porDefecto: false,
    descripcion: "Exigir email verificado antes de poder entrar",
  },
  {
    variable: "DRIVE_MIRROR_ENABLED",
    porDefecto: false,
    descripcion: "Subir también las portadas a Google Drive como espejo",
  },
  {
    variable: "RATE_LIMIT_ENABLED",
    porDefecto: true,
    descripcion: "Aplicar límites de intentos (desactivar SOLO en tests)",
  },
] as const;

export function seExigeVerificacionEmail(entorno?: NodeJS.ProcessEnv): boolean {
  return booleano("AUTH_REQUIRE_EMAIL_VERIFICATION", {
    porDefecto: false,
    ...(entorno !== undefined ? { entorno } : {}),
  });
}

export function espejoDriveActivo(entorno?: NodeJS.ProcessEnv): boolean {
  return booleano("DRIVE_MIRROR_ENABLED", {
    porDefecto: false,
    ...(entorno !== undefined ? { entorno } : {}),
  });
}

export function rateLimitActivo(entorno?: NodeJS.ProcessEnv): boolean {
  return booleano("RATE_LIMIT_ENABLED", {
    porDefecto: true,
    ...(entorno !== undefined ? { entorno } : {}),
  });
}

/**
 * Valida el entorno completo. Se llama UNA vez, al arrancar.
 *
 * Recoge TODOS los problemas antes de lanzar, en vez de parar en el primero:
 * quien despliega prefiere una lista de tres erratas a tres despliegues fallidos
 * seguidos.
 */
export function validarEntorno(entorno?: NodeJS.ProcessEnv): void {
  const env = entorno ?? process.env;
  const problemas: string[] = [];

  for (const bandera of BANDERAS) {
    try {
      booleano(bandera.variable, { porDefecto: bandera.porDefecto, entorno: env });
    } catch (error) {
      problemas.push(error instanceof ErrorConfiguracion ? error.message : String(error));
    }
  }

  if (problemas.length > 0) {
    throw new ErrorConfiguracion(
      "entorno",
      `Configuración inválida (${problemas.length}):\n\n${problemas.join("\n\n")}`,
    );
  }
}
