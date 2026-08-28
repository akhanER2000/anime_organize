import type { TipoSitio } from "./enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS SITIOS DE STREAMING QUE VIENEN DE SERIE.
 *
 * ── LA SEMILLA TRAE SITIOS. **NO TRAE ESPEJOS.** ──────────────────────────
 *
 * Y es la decisión más importante de este fichero, porque es la que el encargo
 * subraya: «los espejos son filas con etiqueta V1, V2, V3… **que YO añado y
 * edito**: no los hardcodees como verdad permanente, los dominios cambian».
 *
 * Un dominio espejo de un sitio de anime dura meses, a veces semanas. Sembrar
 * `animeflv.net` aquí sería escribir en el código una afirmación que caduca sin
 * avisar, y el día que caduque la aplicación **enviaría al usuario a un dominio
 * que ya no es de quien era** — que en este mundo suele ser lo peor que puede
 * pasarle a un enlace.
 *
 * Lo que sí es estable es la MARCA: «AnimeFLV» seguirá llamándose AnimeFLV. Eso
 * se siembra; la dirección la pone su dueño y la corrige cuando cambia.
 *
 * ── POR QUÉ NO HAY UNA URL «PRINCIPAL» EN EL SITIO ───────────────────────
 *
 * La tentación es darle a `streaming_site` una columna `url` con el dominio
 * bueno y dejar los espejos para los alternativos. Sería la misma verdad
 * caducable en otro sitio, y además crea dos conceptos —«la buena» y «las
 * otras»— cuando en la práctica lo que hay es una lista ordenada en la que la
 * primera es la que funciona hoy. `sort` ya expresa eso.
 *
 * ── EL TIPO NO ES DECORATIVO ─────────────────────────────────────────────
 *
 * `GRATIS` / `PAGO` / `MIXTO` es lo que permite decidir de un vistazo si un
 * enlace va a pedir una suscripción. `MIXTO` es el caso real de los sitios con
 * catálogo gratuito y sección de pago.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SitioDeSemilla = {
  /** Estable y único. Es la clave de la deduplicación al re-sembrar. */
  readonly slug: string;
  readonly nombre: string;
  readonly tipo: TipoSitio;
  /** Orden de presentación. Los de pago primero, que es como los lee la gente. */
  readonly orden: number;
};

/**
 * Los trece del encargo, en su orden.
 *
 * Se siembran como `is_global = true`, así que **no pertenecen a nadie** y los
 * ven todos los usuarios. Los que añada cada uno llevan su `user_id` y solo los
 * ve él: lo garantiza el `CHECK ck_streaming_site_propiedad` del esquema, que
 * exige exactamente una de las dos cosas.
 */
export const SITIOS_DE_SEMILLA: readonly SitioDeSemilla[] = [
  { slug: "crunchyroll", nombre: "Crunchyroll", tipo: "PAGO", orden: 10 },
  { slug: "netflix", nombre: "Netflix", tipo: "PAGO", orden: 20 },
  { slug: "prime-video", nombre: "Amazon Prime Video", tipo: "PAGO", orden: 30 },
  { slug: "disney-plus", nombre: "Disney+", tipo: "PAGO", orden: 40 },
  { slug: "hidive", nombre: "HIDIVE", tipo: "PAGO", orden: 50 },

  { slug: "animeflv", nombre: "AnimeFLV", tipo: "GRATIS", orden: 60 },
  { slug: "jkanime", nombre: "JKAnime", tipo: "GRATIS", orden: 70 },
  { slug: "monoschinos", nombre: "Monoschinos", tipo: "GRATIS", orden: 80 },
  { slug: "animefenix", nombre: "AnimeFenix", tipo: "GRATIS", orden: 90 },
  { slug: "tioanime", nombre: "TioAnime", tipo: "GRATIS", orden: 100 },
  { slug: "animelatinohd", nombre: "AnimeLatinoHD", tipo: "GRATIS", orden: 110 },
  { slug: "hianime", nombre: "HiAnime", tipo: "MIXTO", orden: 120 },
  { slug: "otakustv", nombre: "OtakusTV", tipo: "MIXTO", orden: 130 },
];

/**
 * La etiqueta que le toca al siguiente espejo de un sitio.
 *
 * ── POR QUÉ NO ES `V${n + 1}` ────────────────────────────────────────────
 *
 * Porque los espejos se BORRAN. Con `n + 1` sobre el número de filas, borrar V2
 * de una lista de tres deja V1 y V3, y el siguiente vuelve a llamarse V3 —
 * **dos espejos con la misma etiqueta**, que es justo lo que el usuario usa para
 * distinguirlos cuando uno se cae.
 *
 * Se toma el mayor número YA USADO y se suma uno. Las etiquetas no se reciclan:
 * si V3 estuvo caído y se borró, el siguiente es V4, y eso además cuenta una
 * historia útil.
 */
export function siguienteEtiquetaDeEspejo(existentes: readonly string[]): string {
  const numeros = existentes
    .map((etiqueta) => /^V(\d+)$/i.exec(etiqueta.trim()))
    .map((casado) => (casado === null ? 0 : Number.parseInt(casado[1] ?? "0", 10)))
    .filter((n) => Number.isFinite(n));

  const mayor = numeros.length === 0 ? 0 : Math.max(...numeros);
  return `V${String(mayor + 1)}`;
}
