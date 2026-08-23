import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Contadores de rate limiting.
 *
 * POR QUÉ EN POSTGRES Y NO EN MEMORIA: en Vercel cada invocación puede caer en
 * una instancia distinta (y en otra región). Un `Map` en memoria se pierde entre
 * invocaciones y no se comparte, así que un límite de «5 intentos» se convierte
 * en «5 intentos por instancia»: no limita nada. Ver `.claude/rules/security.md` §5.
 *
 * FORMA: **una fila por (clave, ventana)**, no una fila por intento. El contador
 * se incrementa con un `INSERT … ON CONFLICT DO UPDATE … RETURNING` atómico: una
 * sola ida y vuelta, sin condición de carrera y sin que la tabla crezca con el
 * tráfico. Una tabla de intentos individuales acumularía una fila por cada
 * petición de login del mundo, que es justo lo que un atacante quiere provocar.
 */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    /**
     * Identificador del sujeto limitado, con espacio de nombres para que no
     * colisionen dos límites distintos:
     *   `login:ip:203.0.113.7`  ·  `login:email:a@b.test`  ·  `covers:user:<uuid>`
     *
     * El email va **hasheado** (sha256) cuando forma parte de la clave: esta
     * tabla no debe convertirse en un censo de direcciones registradas.
     */
    clave: text("clave").notNull(),

    /** Inicio de la ventana, truncado al tamaño de ventana. */
    ventanaInicio: timestamp("ventana_inicio", { withTimezone: true, mode: "date" }).notNull(),

    contador: integer("contador").notNull().default(0),

    /** Cuándo deja de importar esta fila. Sostiene la limpieza. */
    expiraEn: timestamp("expira_en", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    primaryKey({ name: "pk_rate_limit_bucket", columns: [t.clave, t.ventanaInicio] }),
    /**
     * Limpieza de filas caducadas. Se hace de forma oportunista (un `DELETE`
     * ocasional) en vez de con un cron: menos piezas móviles, y si un día no se
     * ejecuta lo único que pasa es que sobran filas muertas, no que el límite
     * deje de funcionar.
     */
    index("idx_rate_limit_expira").on(t.expiraEn),
  ],
);

export type CuboRateLimit = typeof rateLimitBucket.$inferSelect;
