/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS AVISOS QUE CRUZAN EL ÁRBOL SIN PASAR POR PROPS.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────
 *
 * La navegación inferior de móvil tiene que **abrir el modal de añadir** y
 * **enfocar el buscador**, y las tres piezas cuelgan de sitios distintos del
 * layout: la barra está abajo del todo, el modal vive dentro de
 * `AccionAnadirConModal` y el buscador dentro de `Buscador`.
 *
 * ── POR QUÉ UN EVENTO Y NO UN CONTEXTO ──────────────────────────────────
 *
 * Un contexto obligaría a poner un proveedor en `app/app/layout.tsx`, que es un
 * **Server Component** y tiene que seguir siéndolo: convertirlo a cliente
 * arrastraría la barra superior, el fondo y el contenedor al bundle del
 * navegador para transportar un booleano.
 *
 * Un parámetro en la URL (`?anadir=1`) tampoco: dejaría el estado del modal en
 * el historial, así que el botón de atrás cerraría el modal en vez de volver a
 * la pantalla anterior, y compartir el enlace abriría un modal a quien lo
 * recibiera.
 *
 * Un evento del DOM no necesita ninguna de las dos cosas. El coste es que no
 * hay comprobación de tipos entre quien emite y quien escucha, y por eso **los
 * nombres viven aquí y sólo aquí**: escribir la cadena a mano en los dos lados
 * es exactamente la clase de duplicado que este proyecto tiene registrada.
 *
 * ── SI NADIE ESCUCHA, NO PASA NADA, Y ESO ES UN RIESGO ──────────────────
 *
 * Un evento sin oyente se pierde en silencio: el botón parecería roto. Por eso
 * los dos emisores devuelven si había alguien escuchando, y quien los usa puede
 * decidir qué hacer. Es lo único que evita que esto se convierta en un control
 * inerte.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El id del campo del buscador global. Lo pone `Buscador`. */
export const ID_BUSCADOR = "buscador-global";

const ABRIR_ANADIR = "anime-vault:abrir-anadir";

/**
 * Pide que se abra el modal de añadir.
 *
 * Devuelve `true` si había alguien escuchando. `false` significa que el modal
 * no está montado en esta pantalla, y quien llama debe hacer otra cosa —
 * navegar, por ejemplo— en vez de dejar el botón sin efecto.
 */
export function pedirAbrirAnadir(): boolean {
  if (typeof window === "undefined") return false;
  return window.dispatchEvent(new CustomEvent(ABRIR_ANADIR, { cancelable: true }));
}

/**
 * Escucha la petición. Devuelve la función para dejar de escuchar.
 *
 * El oyente llama a `preventDefault()`: es lo que convierte el `dispatchEvent`
 * del emisor en `false` y le permite saber que alguien lo atendió.
 */
export function alPedirAbrirAnadir(atender: () => void): () => void {
  const oyente = (evento: Event): void => {
    evento.preventDefault();
    atender();
  };

  window.addEventListener(ABRIR_ANADIR, oyente);
  return () => {
    window.removeEventListener(ABRIR_ANADIR, oyente);
  };
}

/**
 * Enfoca el buscador global si está en la pantalla.
 *
 * Devuelve `false` si no está, por el mismo motivo que arriba: un botón
 * «Buscar» que no hace nada es peor que no tenerlo.
 */
export function enfocarBuscador(): boolean {
  if (typeof document === "undefined") return false;

  const campo = document.getElementById(ID_BUSCADOR);
  if (!(campo instanceof HTMLInputElement)) return false;

  campo.focus();
  // Al final del texto, no seleccionándolo: quien vuelve al buscador suele
  // querer seguir escribiendo, no reemplazar lo que ya puso.
  campo.setSelectionRange(campo.value.length, campo.value.length);
  return true;
}
