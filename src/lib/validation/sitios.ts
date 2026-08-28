import { z } from "zod";

import { TIPOS_SITIO } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE SE ACEPTA AL DAR DE ALTA UN SITIO O UN ESPEJO.
 *
 * Mismo esquema en cliente y servidor (`api-conventions.md` § Validación). El
 * cliente valida por comodidad; **el servidor valida porque es lo único que
 * cuenta**.
 *
 * ── LA URL DE UN ESPEJO ES LA PROP MÁS PELIGROSA DE ESTA PANTALLA ────────
 *
 * Con ella pasan dos cosas y las dos hay que cerrarlas aquí:
 *
 * 1. **Se pinta como `href`.** Un `javascript:…` guardado es XSS almacenado
 *    (security.md §8), igual que en los enlaces de continuación. Sólo
 *    `http`/`https`, y lo comprueba el mismo dueño que ya decide eso para toda
 *    la app: `esHrefSeguro`. Aquí se repite la comprobación de esquema en Zod
 *    porque el error tiene que llegar al formulario **con el nombre del campo**.
 * 2. **La pide el servidor** al comprobar espejos. Eso es SSRF, y lo cierra
 *    `src/lib/red/peticion-segura.ts` en el momento de pedirla — no aquí: un
 *    hostname que hoy resuelve a una IP pública puede resolver a una privada
 *    dentro de un minuto, así que validar la IP al GUARDAR no protege nada.
 *    Se valida la FORMA aquí y el DESTINO al conectar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ESQUEMAS_PERMITIDOS = new Set(["http:", "https:"]);

const UrlDeEspejo = z
  .string()
  .trim()
  .min(1, "Escribe la dirección del espejo")
  .max(2048, "La dirección es demasiado larga")
  .refine(
    (valor) => {
      try {
        return ESQUEMAS_PERMITIDOS.has(new URL(valor).protocol);
      } catch {
        return false;
      }
    },
    { message: "Tiene que ser una dirección http o https completa" },
  );

export const EsquemaCrearSitio = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre").max(80, "Como mucho 80 caracteres"),
  tipo: z.enum(TIPOS_SITIO),
});

export const EsquemaEditarSitio = z.object({
  sitioId: z.uuid("Sitio no válido"),
  nombre: EsquemaCrearSitio.shape.nombre,
  tipo: EsquemaCrearSitio.shape.tipo,
});

export const EsquemaBorrarSitio = z.object({
  sitioId: z.uuid("Sitio no válido"),
});

export const EsquemaAnadirEspejo = z.object({
  sitioId: z.uuid("Sitio no válido"),
  url: UrlDeEspejo,
  /**
   * Opcional: si no viene, la calcula `siguienteEtiquetaDeEspejo`. Se acepta
   * `""` del formulario y se traduce a «no la pongas tú», que es lo que quiere
   * decir un campo opcional vacío — el fallo del registro sin nombre fue
   * exactamente no traducirlo.
   */
  etiqueta: z
    .string()
    .trim()
    .max(12, "Como mucho 12 caracteres")
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor)),
});

export const EsquemaBorrarEspejo = z.object({
  espejoId: z.uuid("Espejo no válido"),
});

export type EntradaCrearSitio = z.infer<typeof EsquemaCrearSitio>;
export type EntradaEditarSitio = z.infer<typeof EsquemaEditarSitio>;
export type EntradaAnadirEspejo = z.infer<typeof EsquemaAnadirEspejo>;
