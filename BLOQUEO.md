# DESBLOQUEADO · 2026-08-28

> Este fichero documentó un bloqueo real durante horas. Se conserva **con el
> diagnóstico entero** en vez de borrarse: el fallo que describe es de una
> familia que este proyecto ha repetido seis veces, y el registro vale más que
> la limpieza.

## Resuelto

`production` tiene los **83 animes** del dueño, colgados de su cuenta
(`5d984d2f-d4b2-4022-9541-7f596961b033`), con sus 83 portadas y su progreso.

Verificado en tres niveles, en este orden:

| nivel | qué dijo |
|---|---|
| `GROUP BY user_id` sobre `anime` | `5d984d2f… → 83`, y **una sola fila** en `users` |
| `anime_cover` | 83 portadas · 3,05 MB |
| **un navegador de verdad, con sesión** | la rejilla los pinta, el contador dice «83 de 83 series», buscar «higurashi» devuelve **tres**, y `/api/covers/…` responde `200 image/webp` con el `ETag` = su checksum |

El tercero no es ceremonia: **el recuento ya mintió una vez**, y la única
comprobación que no puede mentir sobre «¿lo ve el dueño?» es mirarlo.

## Qué había pasado

`production` tenía la cuenta y **cero animes**. El seed nunca escribió ahí: la
cuenta la creó el registro de las 02:48:46, y el seed la habría encontrado —o
chocado con ella— si hubiera corrido contra esa rama.

Los 83 estaban en `development`, sembrados el 24 a las 18:50, y el recuento de
«83 animes, 83 portadas» que se dio por bueno como de producción salió de allí:
en línea solo viajó `DATABASE_URL`, mientras `db:verificar` y las transacciones
prefieren `DATABASE_URL_UNPOOLED`, que seguía valiendo lo de `.env.local`.

**Media operación en cada rama, y el anuncio de destino decía la verdad** sobre
la variable que anunciaba. Ése es el fallo, y es el número 6 de la tabla de
`testing.md` § «La operación tuvo éxito. ¿SOBRE QUÉ?».

## Lo que impide que vuelva

1. **`exigirMismaRama()`** en `scripts/rama-destino.ts` — **para antes de
   escribir nada** si `DATABASE_URL` y `DATABASE_URL_UNPOOLED` apuntan a ramas
   distintas. Cableada en `seed`, `migrate` y `verificar-esquema`, con 7 tests y
   verificada por mutación.

2. **El anuncio declara LAS DOS variables** y de dónde salió cada una. No es
   redundante con lo anterior: la guarda cubre «apuntan a sitios distintos» y
   esto cubre «una vino de un fichero cuando creías haberla pasado en línea».

Y funcionó a la primera, sobre mí: el primer intento de migrar contra producción
cayó en `development`, porque una extracción de la cadena falló y las dos
variables salieron vacías. La salida lo dijo en tres líneas —`ep-green-recipe`,
`leída de un fichero .env`, `DATABASE_URL sin definir`— y ahí se paró.

## Lo que queda, y no bloquea

Lotes del `PROMPT_MAESTRO_FINAL.md` sin construir: **B2** (sitios y espejos),
**C1** (enriquecimiento con AniList y Claude), **C2** (importar `.xlsx`), **C4**
(espejo en Drive) y **D3** (estados del sistema y móvil).

Las pestañas de Ajustes que dependen de ellos **no tienen controles inertes**:
dicen qué falta y de qué lote llega.

Y una variable sin configurar: `RESEND_API_KEY` / `EMAIL_FROM`. Sin ellas el
enlace de recuperación **se genera pero no se envía por correo**, así que hoy
hay que sacarlo de la base a mano.
