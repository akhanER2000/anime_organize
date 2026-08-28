"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccionAnadir } from "@/components/layout/barra-superior";
import { Toast } from "@/components/ui/toast";

import { ModalAnadir } from "./modal-anadir";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL BOTÓN «AÑADIR ANIME» Y SU MODAL.
 *
 * ── POR QUÉ ESTO EXISTE COMO PIEZA APARTE ─────────────────────────────────
 *
 * `app/app/layout.tsx` es un Server Component y tiene que seguir siéndolo: es
 * el marco de todo el vault y pasarlo a cliente arrastraría la barra superior,
 * el fondo y el contenedor al bundle del navegador para nada.
 *
 * El estado «modal abierto» es lo único que necesita el cliente, así que
 * `"use client"` baja hasta aquí — que es la regla de `code-style.md`: el
 * `"use client"` va lo más abajo posible del árbol.
 *
 * ── EL AVISO DE LA PORTADA APARECE AQUÍ Y NO EN EL MODAL ──────────────────
 *
 * Si la imagen no se pudo descargar, el anime **se crea igualmente** (ver
 * `acciones.ts`). Enseñar ese aviso dentro del modal obligaría a mantenerlo
 * abierto para leerlo, justo cuando la operación ya terminó bien. Va en un
 * toast, que es lo que el sistema usa para «hecho, con un matiz».
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AccionAnadirConModal() {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <AccionAnadir
        onClick={() => {
          setAbierto(true);
        }}
      />

      <ModalAnadir
        abierto={abierto}
        alCerrar={() => {
          setAbierto(false);
        }}
        alCrear={(_id, avisoPortada) => {
          setAviso(avisoPortada);
          // `revalidatePath` en el servidor invalida la caché; `refresh()` es lo
          // que hace que ESTA pestaña vuelva a pedir los datos. Sin él, la
          // rejilla sigue enseñando lo de antes hasta que se navegue.
          router.refresh();
        }}
      />

      {aviso !== null && (
        <Toast
          tipo="error"
          mensaje={`Añadido, pero la portada no: ${aviso}`}
          duracionMs={10_000}
          alCerrar={() => {
            setAviso(null);
          }}
        />
      )}
    </>
  );
}
