# BLOQUEO · falta la cadena de `production`

> Escrito el 2026-08-27. **Solo bloquea la FASE 0.** Todo lo demás sigue en marcha.

## Qué necesito de ti, exactamente

Dejar el fichero **`J:\Code\Anime_Organize\neon-prod.txt`** con las dos cadenas de la
rama `production` de Neon, en este formato:

```
POOLED=postgresql://…-pooler.…
DIRECTA=postgresql://…            (la misma sin "-pooler")
```

Lo busqué en `J:\Code\Anime_Organize\`, `J:\Code\`, y en tu carpeta de usuario,
Escritorio, Descargas y Documentos. **No está en ninguna.** Lo borro en cuanto
termine, como la otra vez.

Hay un vigía en marcha: en cuanto el fichero aparezca, sigo solo sin que tengas
que decírmelo.

## Por qué hace falta

Para **una sola medición** y para aplicar el arreglo. El diagnóstico está casi
cerrado sin ella:

| Hecho | Cómo se midió |
|---|---|
| La app **no** usa `development` | Sondé una cuenta creada por la app: no aparece en `development` |
| Solo hay **dos ramas** | Medido por ti en la consola de Neon |
| → luego la app usa **`production`** | Por eliminación, ahora sí válida: con dos ramas no hay tercera opción |
| En `production` hay **un solo usuario**, creado a las 02:48:46 | Tu consulta 1 |
| Ese usuario lo creó **el registro, no el seed** | El `created_at` coincide al segundo con un `POST /registro` de los logs |
| `development` tiene 83 animes, todos de un mismo `user_id` | `GROUP BY user_id` → `72314c6d=83` |

Lo único que falta es el `GROUP BY user_id` sobre `anime` **en `production`**.

## La hipótesis que ese número confirma o refuta

Las filas de `anime` cuelgan de `users` con `ON DELETE CASCADE`. Si en
`production` solo hay un usuario y lo creó tu registro, entonces **el usuario que
sembré ya no está** — y con él se habrán llevado los 83 por cascada.

Si es así, `production` tiene **0 animes ahora mismo**, y los 33,66 MB que ves en
la consola son almacenamiento histórico que Neon todavía no ha compactado, no
datos vivos.

**Eso haría que el arreglo no sea reasignar, sino volver a sembrar** — que es
idempotente, no borra nada y ya está autorizado.

La alternativa —que los 83 sigan ahí colgando de un usuario que la consulta 1 no
vio— la descartaría el mismo número. Por eso no se toca nada hasta tenerlo.

## Mientras tanto

Sigo con lo que no depende de `production`:

- Borrar el proyecto `anime-organize` de Vercel.
- FASE 1 completa: las nueve primitivas que faltan, los 26 conceptos duplicados
  y el barrido de agregados calculados en JavaScript.
- FASE 2 por lotes, construida y verificada contra `development`, que tiene los
  mismos 83 animes y el mismo esquema.

Nada de eso escribe en `production`.
