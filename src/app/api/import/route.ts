import { ErrorSesionInvalida, exigirSesionParaMutar } from "@/auth";
import { fallo, exito, type Respuesta } from "@/lib/api/respuesta";
import { comprobarOrigen, origenesPermitidos } from "@/lib/api/csrf";
import { vaultDe } from "@/lib/db";
import { importacionesDe } from "@/lib/db/importaciones";
import { clavePorUsuario, registrarIntento } from "@/lib/rate-limit";
import { detectarColumnas, leerFila } from "@/lib/import-export/mapeo";
import { MAXIMO_BYTES_HOJA, leerHoja } from "@/lib/import-export/leer-hoja";
import { planificar, resumirPlan } from "@/lib/import-export/plan";

import type { FilaPlanificada, ResumenPlan } from "@/lib/import-export/plan";
import type { MapaDeColumnas } from "@/lib/import-export/mapeo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/import — sube la hoja y devuelve EL PLAN. No escribe ningún anime.
 *
 * ── POR QUÉ UN ROUTE HANDLER Y NO UNA SERVER ACTION ─────────────────────
 *
 * `api-conventions.md` lo reparte así: los Route Handlers son para lo que
 * necesita un contrato HTTP de verdad —binarios, **subidas**, descargas—. Un
 * fichero de 5 MiB por el valor de una Server Action se sale del presupuesto de
 * payload de Vercel (1 MiB) y falla con un error de plataforma, no con un
 * mensaje que el usuario pueda entender.
 *
 * ── Y POR ESO LLEVA LA GUARDA CSRF A MANO ───────────────────────────────
 *
 * Next comprueba el origen de las Server Actions por su cuenta; de un Route
 * Handler **no comprueba nada**. `security.md` §2 ter: los que muten llevan la
 * guarda explícita de `src/lib/api/csrf.ts`, y **falla cerrado** si no hay ni
 * `Origin` ni `Referer`.
 *
 * ── ESTE ENDPOINT NO ESCRIBE NADA DEL VAULT ─────────────────────────────
 *
 * Lee el fichero, decide qué haría, guarda **el plan** en `import_job` y
 * devuelve el id. La escritura es el segundo paso y la confirma una persona
 * mirando la lista. Una importación de 300 filas que se ejecuta al soltar el
 * fichero es irreversible en la práctica.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PlanDeImportacion = {
  readonly loteId: string;
  readonly nombreFichero: string;
  readonly columnas: MapaDeColumnas;
  readonly cabeceras: readonly string[];
  readonly plan: readonly FilaPlanificada[];
  readonly resumen: ResumenPlan;
  /** La hoja tenía más filas de las que se leen. Se dice SIEMPRE. */
  readonly recortada: boolean;
};

const MENSAJES = {
  TIPO_NO_SOPORTADO: "Ese fichero no es una hoja de cálculo. Sube un .xlsx o un .csv.",
  DEMASIADO_GRANDE: `El fichero pasa de ${String(Math.round(MAXIMO_BYTES_HOJA / 1024 / 1024))} MB.`,
  HOJA_VACIA: "La hoja no tiene filas debajo de la cabecera.",
  ILEGIBLE: "No se ha podido leer la hoja. ¿Está completa?",
} as const;

export async function POST(peticion: Request): Promise<Response> {
  // 1. CSRF. Antes de nada: es lo único que separa esta ruta de un formulario
  //    alojado en otro dominio con la cookie de sesión puesta.
  const veredicto = comprobarOrigen({
    metodo: "POST",
    cabeceras: peticion.headers,
    origenesPermitidos: origenesPermitidos({
      authUrl: process.env["AUTH_URL"],
      esProduccion: process.env.NODE_ENV === "production",
    }),
  });

  if (!veredicto.permitido) {
    return json(fallo("NO_AUTENTICADO", "Petición rechazada por su origen."), 403);
  }

  // 2. Sesión.
  let sesion;
  try {
    sesion = await exigirSesionParaMutar();
  } catch (error) {
    if (error instanceof ErrorSesionInvalida) {
      return json(fallo("NO_AUTENTICADO", "Inicia sesión para importar."), 401);
    }
    throw error;
  }

  // 3. Límite, ANTES de leer el cuerpo: parsear una hoja de 5 MiB cuesta CPU, y
  //    una ruta que la parsea sin límite es un amplificador de coste.
  // La clave se COMPONE con `clavePorUsuario`. Pasar el `userId` a secas
  // parece equivalente y no lo es: el primer parámetro elige la POLÍTICA
  // (cuántos y en qué ventana) y el segundo identifica el CUBO. Con el id
  // desnudo, todos los límites `*:user` de la misma persona comparten un solo
  // cubo, así que importar una hoja le gastaría el presupuesto de enriquecer y
  // el de comprobar espejos. Lo destapó el recorrido en navegador: el helper
  // que vacía el cubo de importación buscaba claves `import:%` y no encontraba
  // ninguna, porque la clave guardada era un uuid pelado.
  const limite = await registrarIntento(
    "import:user",
    clavePorUsuario("import:user", sesion.userId),
  );
  if (!limite.permitido) {
    const minutos = Math.ceil(limite.reintentarEnSegundos / 60);
    return json(
      fallo("LIMITE_EXCEDIDO", `Has importado demasiadas veces. Vuelve en ${String(minutos)} min.`),
      429,
      { "retry-after": String(limite.reintentarEnSegundos) },
    );
  }

  // 4. El fichero.
  let formulario: FormData;
  try {
    formulario = await peticion.formData();
  } catch {
    return json(fallo("VALIDACION", "No se ha recibido ningún fichero."), 422);
  }

  const fichero = formulario.get("fichero");
  if (!(fichero instanceof File)) {
    return json(fallo("VALIDACION", "No se ha recibido ningún fichero."), 422);
  }

  if (fichero.size > MAXIMO_BYTES_HOJA) {
    // Se corta por el tamaño declarado antes de traerse los bytes a memoria.
    return json(fallo("VALIDACION", MENSAJES.DEMASIADO_GRANDE), 413);
  }

  const hoja = leerHoja(Buffer.from(await fichero.arrayBuffer()));
  if (!hoja.ok) {
    const codigo = hoja.motivo === "TIPO_NO_SOPORTADO" ? "TIPO_NO_SOPORTADO" : "VALIDACION";
    return json(
      fallo(codigo, MENSAJES[hoja.motivo]),
      hoja.motivo === "DEMASIADO_GRANDE" ? 413 : 422,
    );
  }

  // 5. El plan. Los títulos que YA están se piden al vault, filtrados por
  //    usuario como todo lo demás.
  const columnas = detectarColumnas(hoja.cabeceras);
  const filas = hoja.filas.map((fila) => leerFila(fila, columnas));

  // Sin tope: ver `titulosNormalizados`. Un conjunto de deduplicación sobre
  // una consulta acotada reproduce el tope en vez de deduplicar.
  const yaEnElVault = new Set(await vaultDe(sesion.ctx).titulosNormalizados());

  const plan = planificar(filas, yaEnElVault);

  const lote = await importacionesDe(sesion.ctx).guardarPlan(fichero.name, plan);
  if (lote === null) {
    return json(fallo("ERROR_INTERNO", "No se ha podido preparar la importación."), 500);
  }

  const respuesta: PlanDeImportacion = {
    loteId: lote.id,
    nombreFichero: fichero.name,
    columnas,
    cabeceras: hoja.cabeceras.map((c) => (typeof c === "string" ? c : String(c ?? ""))),
    plan,
    resumen: resumirPlan(plan),
    recortada: hoja.recortada,
  };

  return json(exito(respuesta), 200);
}

function json(cuerpo: Respuesta<unknown>, estado: number, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}
