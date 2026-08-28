"use server";

import { revalidatePath } from "next/cache";

import { exigirSesionParaMutar } from "@/auth";
import { exito, fallo, type Respuesta } from "@/lib/api/respuesta";
import { enriquecimientoDe } from "@/lib/db/enriquecimiento";
import { enriquecerUno, type ResultadoEnriquecer } from "@/lib/enrich/orquestar";
import { clavePorUsuario, registrarIntento } from "@/lib/rate-limit";

import { esIdentificadorDeAnime } from "./ficha";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENRIQUECER UN ANIME — lote C1.
 *
 * ── EL LÍMITE VA ANTES DE LA RED, NO DESPUÉS ─────────────────────────────
 *
 * Es el mismo orden que el login: se registra el intento **antes** de gastar
 * nada. Aquí lo caro no es un Argon2id, son dos peticiones a terceros —una de
 * ellas de pago—, así que una sesión robada sin límite sería una factura.
 * 60/hora (`security.md` §5) da de sobra para enriquecer a mano.
 *
 * ── SIN CLAVE DE IA NO ES UN ERROR ───────────────────────────────────────
 *
 * Se devuelve `ok: true` con el aviso puesto, igual que `ANIME_SIMILAR`: es un
 * resultado esperado del flujo y no un fallo (`api-conventions.md`). Pintar un
 * error rojo porque falta una variable opcional le diría al dueño que algo se
 * ha roto cuando lo único que pasa es que no ha configurado la IA.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type RespuestaEnriquecer = {
  readonly resultado: ResultadoEnriquecer;
  /** Listo para enseñar tal cual. En español, sin nombres de proveedor. */
  readonly mensaje: string;
};

function describir(r: ResultadoEnriquecer): string {
  if (r.anilist === "SIN_RESULTADO") {
    return "AniList no encontró nada con ese título. Prueba a ajustarlo en la ficha.";
  }
  if (r.anilist === "ERROR") {
    return "No se ha podido consultar AniList ahora mismo. Vuelve a intentarlo en un rato.";
  }
  if (r.anilist === "OMITIDO") {
    return "Este anime ya estaba enriquecido. No se ha vuelto a consultar nada.";
  }

  if (r.ia === "NO_CONFIGURADA") {
    return "Datos de AniList actualizados. Las etiquetas de IA necesitan una clave de Anthropic configurada.";
  }
  if (r.ia === "ERROR") {
    return "Datos de AniList actualizados. El análisis de IA falló y no se ha guardado nada de él.";
  }
  if (r.ia === "OMITIDO") return "Datos de AniList actualizados.";

  return "Listo: datos de AniList y etiquetas de IA actualizados.";
}

export async function enriquecerAnime(
  animeId: unknown,
  reanalizar = false,
): Promise<Respuesta<RespuestaEnriquecer>> {
  const sesion = await exigirSesionParaMutar();

  // El id se valida ANTES de tocar la base, igual que en la ficha: una cadena
  // que no es un uuid no debe llegar a Postgres a provocar un error de tipo.
  if (typeof animeId !== "string" || !esIdentificadorDeAnime(animeId)) {
    return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");
  }

  // La clave se compone: ver la nota de `api/import/route.ts`.
  const limite = await registrarIntento(
    "enrich:user",
    clavePorUsuario("enrich:user", sesion.userId),
  );
  if (!limite.permitido) {
    const minutos = Math.ceil(limite.reintentarEnSegundos / 60);
    return fallo(
      "LIMITE_EXCEDIDO",
      `Has enriquecido demasiadas veces esta hora. Vuelve a intentarlo en ${String(minutos)} min.`,
    );
  }

  const datos = enriquecimientoDe(sesion.ctx);
  const resultado = await enriquecerUno(datos, animeId, { reanalizar });

  // `null` = no existe **o no es suyo**. Indistinguible, como en toda la app.
  if (resultado === null) return fallo("NO_ENCONTRADO", "Ese anime no está en tu vault.");

  revalidatePath(`/app/anime/${animeId}`);

  return exito({ resultado, mensaje: describir(resultado) });
}
