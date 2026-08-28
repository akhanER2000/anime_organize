"use server";

import { revalidatePath } from "next/cache";

import { exigirSesionParaMutar } from "@/auth";
import { exito, fallo, falloDeValidacion, type Respuesta } from "@/lib/api/respuesta";
import { sitiosDe } from "@/lib/db/sitios";
import { clavePorUsuario, registrarIntento } from "@/lib/rate-limit";
import { comprobarEspejos } from "@/lib/red/comprobar-espejo";
import {
  EsquemaAnadirEspejo,
  EsquemaBorrarEspejo,
  EsquemaBorrarSitio,
  EsquemaCrearSitio,
  EsquemaEditarSitio,
} from "@/lib/validation/sitios";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL HUB DE SITIOS Y ESPEJOS — encargo §8, lote B2.
 *
 * ── POR QUÉ SERVER ACTIONS Y NO UN ROUTE HANDLER ─────────────────────────
 *
 * `api-conventions.md` lo reparte: Server Actions para lo que nace de un
 * formulario o de un botón de la UI. Todo esto lo es. Y `security.md` §2 ter
 * añade el motivo que pesa: **Next comprueba el origen de las Server Actions
 * por su cuenta**, así que no hay una guarda CSRF que se pueda olvidar en la
 * ruta número doce.
 *
 * La regla del documento menciona `POST /api/sitios/comprobar` como Route
 * Handler; se implementa como acción por lo anterior, y porque no necesita
 * nada de lo que justifica un handler —ni binarios, ni subidas, ni un cliente
 * externo—. El rate limit que esa misma regla exige **sí se aplica**, con la
 * clave que ya estaba escrita en la política: `comprobar-espejos:user`, 10/h.
 *
 * ── LO QUE UN USUARIO PUEDE TOCAR, Y LO QUE NO ───────────────────────────
 *
 * Los trece sitios de la semilla son `is_global = true`: **los ve todo el
 * mundo y no los edita nadie**. La capa de datos lo hace cumplir con dos
 * predicados distintos —`visibles()` para leer, `mios()` para escribir—, así
 * que aquí no hay que acordarse: un intento de editar un sitio global devuelve
 * `null` y sale como NO_ENCONTRADO, que es lo que `security.md` §1 pide para
 * «existe pero no es tuyo».
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Una sola ruta que repintar: todo esto vive en la pestaña de Ajustes. */
function repintar(): void {
  revalidatePath("/app/ajustes");
}

const NO_ES_TUYO = "Ese sitio no existe en tu lista.";

export async function crearSitio(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaCrearSitio.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const creado = await sitiosDe(sesion.ctx).crear(validado.data);
  if (creado === null) {
    // El `slug` lleva un `UNIQUE` global. Dos sitios con el mismo nombre del
    // mismo usuario chocan; el de otro usuario no, porque el slug va prefijado
    // con su id. Nunca un 500 (`api-conventions.md`).
    return fallo("CONFLICTO_ESTADO", "Ya tienes un sitio con ese nombre.");
  }

  repintar();
  return exito({ id: creado.id });
}

export async function editarSitio(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaEditarSitio.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { sitioId, ...datos } = validado.data;
  const editado = await sitiosDe(sesion.ctx).editar(sitioId, datos);
  if (editado === null) return fallo("NO_ENCONTRADO", NO_ES_TUYO);

  repintar();
  return exito({ id: editado.id });
}

export async function borrarSitio(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaBorrarSitio.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const borrado = await sitiosDe(sesion.ctx).borrar(validado.data.sitioId);
  if (borrado === null) return fallo("NO_ENCONTRADO", NO_ES_TUYO);

  repintar();
  return exito({ id: borrado.id });
}

export async function anadirEspejo(
  entrada: unknown,
): Promise<Respuesta<{ id: string; etiqueta: string }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaAnadirEspejo.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { sitioId, url, etiqueta } = validado.data;
  const anadido = await sitiosDe(sesion.ctx).anadirEspejo(sitioId, {
    url,
    // `exactOptionalPropertyTypes`: pasar `{ etiqueta: undefined }` NO es lo
    // mismo que omitir la clave, y la capa de datos distingue las dos cosas.
    ...(etiqueta === undefined ? {} : { etiqueta }),
  });

  if (anadido === null) return fallo("NO_ENCONTRADO", NO_ES_TUYO);

  repintar();
  return exito(anadido);
}

export async function borrarEspejo(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaBorrarEspejo.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const borrado = await sitiosDe(sesion.ctx).borrarEspejo(validado.data.espejoId);
  if (borrado === null) return fallo("NO_ENCONTRADO", "Ese espejo no existe en tu lista.");

  repintar();
  return exito({ id: borrado.id });
}

export type ResumenComprobacion = {
  readonly comprobados: number;
  readonly vivos: number;
  readonly caidos: number;
};

/**
 * Comprueba TODOS los espejos propios y anota el resultado.
 *
 * ── EL LÍMITE ES LO PRIMERO, Y NO ES BUROCRACIA ──────────────────────────
 *
 * Este botón dispara peticiones **a terceros**. Sin límite, es un amplificador:
 * una sesión y un bucle bastan para que la infraestructura de Vercel golpee un
 * dominio ajeno tantas veces como se quiera, con nuestra cara. 10/hora
 * (`security.md` §5) es de sobra para el uso real —los dominios espejo cambian
 * cada semanas, no cada minuto—.
 *
 * ── NUNCA SE BORRA UN ESPEJO ─────────────────────────────────────────────
 *
 * Caído significa `is_active = false` y `last_checked_at` puesto. Un 503 de hoy
 * puede ser un 200 mañana, y borrarlo obligaría al dueño a volver a buscar una
 * dirección que ya tenía.
 */
export async function comprobarEspejosDelUsuario(): Promise<Respuesta<ResumenComprobacion>> {
  const sesion = await exigirSesionParaMutar();

  // La clave se compone: ver la nota de `api/import/route.ts`. Con el id
  // desnudo, este límite compartiría cubo con el de importar y el de enriquecer.
  const limite = await registrarIntento(
    "comprobar-espejos:user",
    clavePorUsuario("comprobar-espejos:user", sesion.userId),
  );
  if (!limite.permitido) {
    // El tiempo va EN EL MENSAJE: `detalles` del sobre es sólo para errores
    // de campo (`api-conventions.md`), y «inténtalo más tarde» a secas deja al
    // usuario reintentando a ciegas y gastando un intento en cada prueba.
    const minutos = Math.ceil(limite.reintentarEnSegundos / 60);
    return fallo(
      "LIMITE_EXCEDIDO",
      `Has comprobado los espejos demasiadas veces esta hora. Vuelve a intentarlo en ${String(minutos)} min.`,
    );
  }

  const sitios = sitiosDe(sesion.ctx);
  const espejos = await sitios.espejosParaComprobar();
  if (espejos.length === 0) {
    return exito({ comprobados: 0, vivos: 0, caidos: 0 });
  }

  const resultados = await comprobarEspejos(espejos);
  const ahora = new Date();

  // En serie a propósito: son como mucho unas decenas de filas y escribirlas a
  // la vez no aporta nada frente al riesgo de agotar el pool en serverless.
  for (const r of resultados) {
    await sitios.anotarComprobacion(r.id, r.vivo, ahora);
  }

  const vivos = resultados.filter((r) => r.vivo).length;

  repintar();
  return exito({
    comprobados: resultados.length,
    vivos,
    caidos: resultados.length - vivos,
  });
}
