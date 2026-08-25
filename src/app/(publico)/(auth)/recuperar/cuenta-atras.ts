/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CUENTA ATRÁS DEL BOTÓN DE REENVÍO.
 *
 * ── ES COSMÉTICA, Y CONVIENE DECIRLO EN EL PROPIO MÓDULO ──────────────────
 * Nada de lo que hay aquí protege nada. El límite real es el del servidor
 * (`recuperar:email`, 3/hora — `security.md` §5), y se aplica en la Server
 * Action ANTES de tocar nada. Este contador solo evita el reenvío por reflejo:
 * el del usuario que no ve llegar el correo en tres segundos y vuelve a pulsar,
 * gastando uno de sus tres intentos de la hora sin querer.
 *
 * Quien abra las herramientas de desarrollo lo pone a cero en dos segundos. No
 * pasa nada: la petición se corta igual en el servidor.
 *
 * ── POR QUÉ ES UN `.ts` SUELTO Y NO PARTE DE `formulario.tsx` ─────────────
 * Vitest corre con `environment: "node"` y **no transforma `.tsx`**: un test
 * que importe el componente falla al parsear el JSX. La lógica que merece test
 * —el formateo, el redondeo, el corte en cero— vive aquí, donde se puede
 * ejecutar sin navegador, sin React y sin reloj real.
 *
 * Todas las funciones son PURAS: el instante «ahora» entra como parámetro. Sin
 * eso, testear la cuenta atrás obligaría a mockear el reloj (`testing.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Segundos que faltan para poder reenviar.
 *
 * Se redondea **hacia arriba** a propósito: mientras quede un milisegundo, el
 * usuario ve «1» y el botón sigue bloqueado. Redondeando hacia abajo, el último
 * segundo se enseñaría como «0» con el botón todavía deshabilitado, que es la
 * clase de detalle que hace pensar que la interfaz está colgada.
 *
 * Nunca devuelve un número negativo ni `NaN`: un fin no finito se trata como
 * «ya se puede», porque el bloqueo aquí no es una protección y quedarse
 * bloqueado para siempre sí sería un fallo real.
 */
export function segundosRestantes(finMs: number, ahoraMs: number): number {
  if (!Number.isFinite(finMs) || !Number.isFinite(ahoraMs)) return 0;

  const quedan = Math.ceil((finMs - ahoraMs) / 1000);
  return quedan > 0 ? quedan : 0;
}

/**
 * Formato `m:ss` — el del artboard («0:42»).
 *
 * Los minutos NO se rellenan con cero a la izquierda (es «0:42», no «00:42») y
 * los segundos SÍ (es «1:05», no «1:5»).
 */
export function formatearCuentaAtras(segundos: number): string {
  const seguros = Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 0;

  const minutos = Math.floor(seguros / 60);
  const resto = seguros % 60;

  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

/**
 * ¿Se puede reenviar ya?
 *
 * Ojo con el orden de la comparación: `NaN <= 0` es `false`, así que un valor
 * corrupto deja el botón bloqueado en vez de desbloquearlo. Es la dirección
 * correcta para equivocarse: un botón que no se activa se ve; uno que se activa
 * cuando no debe, no.
 */
export function puedeReenviar(segundos: number): boolean {
  return segundos <= 0;
}

/**
 * La etiqueta del botón, que cambia con la cuenta atrás.
 *
 * Es una sola función y no dos ramas en el JSX porque **el texto del botón es
 * su nombre accesible**: un lector de pantalla lee «Reenviar en 0:42» y sabe
 * por qué está deshabilitado. Tenerlo aquí permite testear las dos formas.
 */
export function etiquetaReenvio(segundos: number): string {
  return puedeReenviar(segundos)
    ? "Reenviar el enlace"
    : `Reenviar en ${formatearCuentaAtras(segundos)}`;
}
