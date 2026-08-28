"use server";

import { revalidatePath } from "next/cache";

import { exigirSesionParaMutar } from "@/auth";
import { exito, fallo, falloDeValidacion, type Respuesta } from "@/lib/api/respuesta";
import { descargarImagen, MAXIMO_BYTES } from "@/lib/covers/descargar";
import { checksumDe, procesarPortada } from "@/lib/covers/procesar";
import { vaultDe } from "@/lib/db";
import {
  completarTemporada,
  decidirAlta,
  marcarCompleto,
  progresoLibre,
  sumarEpisodio,
  type Hallazgos,
} from "@/lib/domain/alta";
import { normalizarTitulo } from "@/lib/domain/normalizar";
import {
  EsquemaCrearAnime,
  EsquemaEditarAnime,
  EsquemaGuardarEnlace,
  EsquemaGuardarProgreso,
  EsquemaIdAnime,
} from "@/lib/validation/anime";

import type { Vault } from "@/lib/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS MUTACIONES DEL VAULT — Server Actions, y eso ES la defensa CSRF.
 *
 * `security.md` §2 ter: Next comprueba el origen de las Server Actions por su
 * cuenta. Un `POST /api/animes` con la cookie de sesión se ejecuta venga de
 * donde venga; esto no.
 *
 * ── TODAS EMPIEZAN IGUAL, Y NO ES CEREMONIA ───────────────────────────────
 *
 * `exigirSesionParaMutar()` consulta la base **sin caché**: `security.md` §1 bis
 * fija ventana cero para las escrituras. Leer un listado obsoleto durante 60 s
 * es tolerable; modificar el vault de alguien que acaba de revocar sus sesiones,
 * no.
 *
 * Y devuelve el `ctx`, que es lo único con lo que se puede abrir un vault. No
 * hay forma de escribir aquí sin haber pasado por ahí: no es disciplina, es el
 * tipo (`db-conventions.md` § «El contrato de datos»).
 *
 * ── POR QUÉ DEVUELVEN UN SOBRE Y NO LANZAN ────────────────────────────────
 *
 * En producción Next borra el mensaje de un error lanzado y manda un digest —a
 * propósito, para no filtrar las tripas—. Un `throw new Error("Ya tienes este
 * anime")` llegaría al usuario como «se ha producido un error». Ver
 * `lib/api/respuesta.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Las dos pantallas del vault. Se revalidan juntas: pintan los mismos datos. */
function revalidarVault(): void {
  revalidatePath("/app");
  revalidatePath("/app/lista");
}

/**
 * Lo que la base sabe decir sobre un título antes de crearlo.
 *
 * Las tres consultas salen **a la vez**: son independientes y esperar una
 * detrás de otra triplicaría el tiempo del alta sin ganar nada.
 */
async function buscarHallazgos(
  vault: Vault,
  titulo: string,
  anilistId: number | null,
): Promise<Hallazgos> {
  const normalizado = normalizarTitulo(titulo);

  const [exacto, porAnilist, similares] = await Promise.all([
    vault.porTituloNormalizado(normalizado),
    anilistId === null ? Promise.resolve(null) : vault.porAnilistId(anilistId),
    vault.similares(normalizado),
  ]);

  return {
    exacto,
    porAnilist,
    // El exacto ya se trata aparte; dejarlo también entre los parecidos haría
    // que el aviso de similitud ofreciera «ver el que tengo» sobre el mismo
    // anime que el bloqueo acaba de nombrar.
    similares: similares.filter((candidato: { id: string }) => candidato.id !== exacto?.id),
  };
}

/**
 * Descarga una portada y la deja lista para guardar.
 *
 * ── LA URL ES EL ORIGEN, NUNCA EL ALMACENAMIENTO ──────────────────────────
 *
 * Skill de dominio §5, y es el invariante que el e2e crítico comprueba: los
 * bytes acaban en Postgres y el `<img>` apunta a `/api/covers/…`. `source_url`
 * se guarda solo como referencia histórica y **nada de la aplicación lee de
 * ahí**. Si se guardara la URL como fuente de verdad, el vault se rompería el
 * día que el sitio de origen cambiara de dominio — que es lo que hacen todos.
 *
 * Toda la defensa contra SSRF vive en `descargarImagen`: bloqueo de rangos
 * privados sobre las IPs resueltas, pin de la IP validada, máximo tres saltos
 * revalidando cada uno, timeout de 10 s, tope de 8 MB por streaming y magic
 * bytes. `security.md` §4.
 */
async function traerPortada(
  url: string,
): Promise<
  | { readonly ok: true; readonly datos: Parameters<Vault["guardarPortada"]>[1] }
  | { readonly ok: false; readonly respuesta: Respuesta<never> }
> {
  const descarga = await descargarImagen(url);

  if (!descarga.ok) {
    // Los mensajes NO nombran la red interna: `security.md` §4 punto 11. Al
    // cliente le llega el motivo en su idioma, nunca `ECONNREFUSED 10.0.0.5`.
    const motivos = {
      DEMASIADO_GRANDE: [
        "IMAGEN_DEMASIADO_GRANDE",
        `Esa imagen pesa más de ${String(Math.round(MAXIMO_BYTES / 1024 / 1024))} MB.`,
      ],
      TIPO_NO_SOPORTADO: [
        "TIPO_NO_SOPORTADO",
        "Ese formato no vale. Tienen que ser JPEG, PNG, WebP o AVIF.",
      ],
    } as const;

    const conocido =
      descarga.motivo in motivos ? motivos[descarga.motivo as keyof typeof motivos] : null;

    return {
      ok: false,
      respuesta: conocido
        ? fallo(conocido[0], conocido[1])
        : fallo(
            "IMAGEN_NO_DESCARGABLE",
            "No se pudo descargar esa imagen. Comprueba la dirección e inténtalo otra vez.",
          ),
    };
  }

  const procesada = await procesarPortada(descarga.bytes);

  if (!procesada.ok) {
    return {
      ok: false,
      respuesta: fallo("TIPO_NO_SOPORTADO", "Ese fichero no es una imagen que se pueda usar."),
    };
  }

  return {
    ok: true,
    datos: {
      bytes: procesada.portada.bytes,
      miniatura: procesada.portada.miniatura,
      mime: procesada.portada.mime,
      ancho: procesada.portada.ancho,
      alto: procesada.portada.alto,
      // El checksum es del ORIGINAL, no del WebP: es lo que permite reconocer
      // que dos altas usaron la misma imagen aunque sharp produzca bytes
      // distintos en dos versiones de libvips. Skill §5 paso 2.
      checksum: checksumDe(descarga.bytes),
      urlOrigen: url,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALTA
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoAlta =
  | { readonly clase: "CREADO"; readonly id: string; readonly avisoPortada: string | null }
  | {
      readonly clase: "PREGUNTA";
      readonly candidatos: readonly { readonly id: string; readonly titulo: string }[];
    };

/**
 * Da de alta un anime.
 *
 * ── EL ORDEN, Y POR QUÉ ES ÉSTE ───────────────────────────────────────────
 *
 * parsear → decidir el duplicado → crear → portada → progreso.
 *
 * La portada va **después** de crear y no antes: descargar una imagen de 8 MB
 * para descubrir a continuación que el título estaba duplicado es trabajo
 * regalado, y con un límite de red por medio.
 *
 * Y si la portada falla, **el anime se queda**. Perder el alta entera porque
 * una URL de imagen estaba rota sería castigar al usuario por un fallo de un
 * tercero; se crea, se avisa, y la portada se puede poner después desde la
 * ficha. El aviso viaja en `avisoPortada` — `ok: true` con un aviso no es una
 * contradicción, ver `respuesta.ts`.
 */
export async function crearAnime(
  entrada: unknown,
  forzar = false,
): Promise<Respuesta<ResultadoAlta>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaCrearAnime.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const datos = validado.data;
  const vault = vaultDe(sesion.ctx);

  const hallazgos = await buscarHallazgos(vault, datos.titulo, null);
  const veredicto = decidirAlta(hallazgos, forzar);

  if (veredicto.clase === "BLOQUEADO") {
    return fallo(
      "ANIME_DUPLICADO",
      veredicto.motivo === "TITULO"
        ? `Ya tienes «${veredicto.existente.titulo}» en tu vault.`
        : `«${veredicto.existente.titulo}» es el mismo anime, con otro título.`,
    );
  }

  if (veredicto.clase === "PREGUNTA") {
    // 200 y `ok: true`: es una pregunta, no un fallo (`api-conventions.md`).
    return exito({ clase: "PREGUNTA", candidatos: veredicto.candidatos });
  }

  const creado = await vault.crear({
    titulo: datos.titulo,
    estado: datos.estado,
    notas: datos.notas,
    esFavorito: datos.esFavorito,
  });

  if (creado === null) {
    // La base rechazó el `UNIQUE` aunque la comprobación de arriba dijera que
    // no. Pasa si el mismo título se envía dos veces a la vez, y es exactamente
    // por eso que la restricción existe. `api-conventions.md`: nunca un 500.
    return fallo("ANIME_DUPLICADO", "Ya tienes ese anime en tu vault.");
  }

  let avisoPortada: string | null = null;

  if (datos.urlPortada !== null) {
    const portada = await traerPortada(datos.urlPortada);
    if (portada.ok) await vault.guardarPortada(creado.id, portada.datos);
    else avisoPortada = portada.respuesta.ok ? null : portada.respuesta.error.mensaje;
  }

  if (datos.etiquetaProgreso !== null) {
    await vault.guardarProgreso(creado.id, progresoLibre(datos.etiquetaProgreso, null));
  }

  revalidarVault();

  return exito({ clase: "CREADO", id: creado.id, avisoPortada });
}

// ═══════════════════════════════════════════════════════════════════════════
// EDICIÓN Y BORRADO
// ═══════════════════════════════════════════════════════════════════════════

export async function editarAnime(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaEditarAnime.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { animeId, titulo, estado, esFavorito, notas } = validado.data;
  const vault = vaultDe(sesion.ctx);

  // Se compone campo a campo en vez de con un `...resto`: con
  // `exactOptionalPropertyTypes`, un `estado: undefined` explícito NO es lo
  // mismo que no traer la clave, y el segundo es lo que significa «no lo
  // cambies». Un spread mandaría el primero y el ORM escribiría `null`.
  const cambios: Parameters<Vault["editar"]>[1] = { notas };
  if (titulo !== undefined) cambios.titulo = titulo;
  if (estado !== undefined) cambios.estado = estado;
  if (esFavorito !== undefined) cambios.esFavorito = esFavorito;

  // Un título nuevo puede chocar con otro anime del mismo usuario. Se comprueba
  // antes para dar el mensaje bueno; el `UNIQUE` sigue siendo quien garantiza.
  if (titulo !== undefined) {
    const choque = await vault.porTituloNormalizado(normalizarTitulo(titulo));
    if (choque !== null && choque.id !== animeId) {
      return fallo("ANIME_DUPLICADO", `Ya tienes «${choque.titulo}» con ese título.`);
    }
  }

  const editado = await vault.editar(animeId, cambios);
  // `null` es «no existe O no es tuyo», indistinguibles a propósito
  // (`security.md` §1: 404 y nunca 403).
  if (editado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  revalidarVault();
  revalidatePath(`/app/anime/${animeId}`);

  return exito({ id: editado.id });
}

/**
 * Borra un anime.
 *
 * ── EL «DESHACER» NO ESTÁ AQUÍ, Y ESO ES UNA DECISIÓN ─────────────────────
 *
 * El encargo pide «confirmación y deshacer de 10 segundos». Hay dos formas y
 * fallan de forma muy distinta:
 *
 *   · **Borrar ya y recrear al deshacer.** Si la pestaña se cierra dentro de
 *     esos 10 s, la instantánea del deshacer se va con ella y **los datos se
 *     pierden sin vuelta atrás**. Además el anime volvería con otro `id`, así
 *     que cualquier enlace a su ficha quedaría muerto.
 *   · **Esperar los 10 s antes de llamar aquí.** Si la pestaña se cierra, el
 *     borrado no llega a ocurrir.
 *
 * Se elige la segunda: el peor caso es «lo que querías borrar sigue ahí», que
 * se arregla volviéndolo a borrar. El peor caso de la primera es perder datos.
 *
 * Consecuencia asumida y dicha sin adornos: **cerrar la pestaña durante la
 * cuenta atrás cancela el borrado.** La interfaz lo dice en el aviso.
 *
 * El `ON DELETE CASCADE` se lleva portada, progreso, géneros y enlaces. Es del
 * esquema, no de aquí, y está fijado en `enlaces.integracion.test.ts`.
 */
export async function borrarAnime(idCrudo: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaIdAnime.safeParse(idCrudo);
  if (!validado.success) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  const borrado = await vaultDe(sesion.ctx).borrar(validado.data);
  if (borrado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  revalidarVault();

  return exito({ id: borrado.id });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESO
// ═══════════════════════════════════════════════════════════════════════════

export type AccionRapida = "EPISODIO_MAS" | "TEMPORADA_COMPLETA" | "TODO_VISTO";

/**
 * Los tres botones rápidos de la skill §4.
 *
 * El progreso actual se **lee del servidor**, no se recibe: `+1 episodio` sobre
 * un número que mandó el cliente sería incrementar lo que el cliente diga, y dos
 * pestañas abiertas producirían dos episodios distintos según cuál se pulsara
 * primero.
 */
export async function progresoRapido(
  idCrudo: unknown,
  accion: AccionRapida,
): Promise<Respuesta<{ etiqueta: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaIdAnime.safeParse(idCrudo);
  if (!validado.success) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  const vault = vaultDe(sesion.ctx);
  // El progreso se lee del SERVIDOR, no llega por parámetro: con dos pestañas
  // abiertas, «+1 episodio» sobre el número que mande el cliente produciría dos
  // resultados distintos según cuál se pulse primero.
  const progresoActual = await vault.progresoDe(validado.data);

  const actual = {
    tipo: progresoActual?.tipo ?? null,
    temporada: progresoActual?.temporada ?? null,
    episodio: progresoActual?.episodio ?? null,
    porcentaje: progresoActual?.porcentaje ?? null,
  };

  const siguiente =
    accion === "EPISODIO_MAS"
      ? sumarEpisodio(actual)
      : accion === "TEMPORADA_COMPLETA"
        ? completarTemporada(actual)
        : marcarCompleto();

  const guardado = await vault.guardarProgreso(validado.data, siguiente);
  if (guardado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  // «Marcar todo visto» cambia también el ESTADO: skill §4. Sin esto, el anime
  // quedaría con el progreso al 100 % y el chip diciendo «Viendo».
  if (accion === "TODO_VISTO") await vault.editar(validado.data, { estado: "VISTO" });

  revalidarVault();
  revalidatePath(`/app/anime/${validado.data}`);

  return exito({ etiqueta: siguiente.label });
}

/** Progreso libre: la etiqueta que escriba, con o sin porcentaje. */
export async function guardarProgreso(entrada: unknown): Promise<Respuesta<{ etiqueta: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaGuardarProgreso.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { animeId, etiqueta, porcentaje } = validado.data;
  const siguiente = progresoLibre(etiqueta ?? "", porcentaje);

  const guardado = await vaultDe(sesion.ctx).guardarProgreso(animeId, siguiente);
  if (guardado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  revalidarVault();
  revalidatePath(`/app/anime/${animeId}`);

  return exito({ etiqueta: siguiente.label });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENLACES PARA CONTINUAR
// ═══════════════════════════════════════════════════════════════════════════

export async function guardarEnlace(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaGuardarEnlace.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { animeId, ...enlace } = validado.data;
  const guardado = await vaultDe(sesion.ctx).guardarEnlace(animeId, enlace);
  if (guardado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  revalidarVault();
  revalidatePath(`/app/anime/${animeId}`);

  return exito({ id: guardado.id });
}

/**
 * Marca un enlace como usado y devuelve su URL.
 *
 * ── LA URL SALE DE LA BASE, NO DEL CLIENTE ────────────────────────────────
 *
 * Quien abre la pestaña necesita una dirección. Aceptarla como parámetro
 * convertiría esta acción en un redirector abierto: cualquiera podría hacer que
 * un clic dentro del vault llevara a donde quisiera. Se devuelve la que está
 * guardada, que además pasó por `EsquemaUrlEnlace` y por el `CHECK` de la
 * columna al entrar.
 */
export async function abrirEnlace(idCrudo: unknown): Promise<Respuesta<{ url: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaIdAnime.safeParse(idCrudo);
  if (!validado.success) return fallo("NO_ENCONTRADO", "Ese enlace no está en tu vault.");

  const usado = await vaultDe(sesion.ctx).marcarEnlaceUsado(validado.data);
  if (usado === null) return fallo("NO_ENCONTRADO", "Ese enlace no está en tu vault.");

  revalidarVault();

  return exito({ url: usado.url });
}

export async function borrarEnlace(idCrudo: unknown): Promise<Respuesta<{ id: string }>> {
  const sesion = await exigirSesionParaMutar();
  const validado = EsquemaIdAnime.safeParse(idCrudo);
  if (!validado.success) return fallo("NO_ENCONTRADO", "Ese enlace no está en tu vault.");

  const borrado = await vaultDe(sesion.ctx).borrarEnlace(validado.data);
  if (borrado === null) return fallo("NO_ENCONTRADO", "Ese enlace no está en tu vault.");

  revalidarVault();

  return exito({ id: borrado.id });
}
