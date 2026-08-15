# Listas: crearlas, y armarlas entre varios

Una lista tiene **dos permisos que no son el mismo**, y casi todo lo de acá sale
de esa distinción:

| | Quién | Columna |
| --- | --- | --- |
| **Visibilidad** | quién la **lee** | `visibilidad` — `privada` \| `publica` |
| **Colaboración** | quién la **escribe** | `colaborativa` + `playlist_colaboradores` |

Son ortogonales y se combinan. El caso normal de una colaborativa es
**privada**: la escriben tres personas y no la ve nadie más.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `app/lista/nueva.tsx` | Elegir la clase de lista: común o colaborativa |
| `app/lista/nombre.tsx` | Ponerle nombre; es acá donde recién se crea |
| `app/lista/personas.tsx` | El link para sumar, buscar contactos, y quiénes están |
| `app/lista/[id].tsx` | La lista por link — y la puerta de `?colaborar=1` |
| `src/services/playlists.ts` | `createPlaylist`, `joinPlaylist`, los colaboradores |
| `src/lib/compartirLista.ts` | Los dos links: el de mirar y el de sumarse |
| `supabase/migrations/20260815220000_listas_colaborativas.sql` | Policies y RPCs |
| `supabase/tests/listas_colaborativas.sql` | Las pruebas de todo lo de arriba |

## El flujo de crear

```
  «+»  →  ¿qué clase?  →  ponele nombre  →  [si es colaborativa] sumá gente
```

**El «+» ya no crea nada.** Antes creaba «Mi lista #N» y te dejaba adentro —era
lo que hacía Spotify entonces, y tenía razón: el nombre se sabe después, cuando
ya viste en qué terminó. Eso vale mientras haya una sola clase de lista.

Con las colaborativas hay una decisión que no es el nombre —a quién dejás
entrar— y que no se arregla igual de fácil después. De paso se arregla algo que
molestaba: la lista **nace con el nombre puesto**, así que arrepentirse a mitad
de camino ya no deja una «Mi lista #4» vacía en la biblioteca para siempre.

El nombre sugerido lo calcula `app/index.tsx` y viaja en la ruta: la biblioteca
ya está en memoria y pedirla de nuevo desde la hoja sería un viaje a la red para
escribir un número.

Las tres hojas se **reemplazan** (`router.replace`), no se apilan: cerrar la de
nombre te devuelve a la app, no a elegir de nuevo algo que ya elegiste.

## Cómo se suma alguien

**Por link.** `linkParaColaborar(id)` arma `…/lista/<id>?colaborar=1`. Tiene que
ser distinto del link de mirar por una razón que no es de estilo: una
colaborativa suele ser privada, y a quien todavía no colabora
`get_public_playlist` **no le devuelve nada** — con el link común vería «esta
lista no está disponible». El `?colaborar=1` hace que la pantalla pida entrar
*antes* de cargar, que es el único orden que funciona.

Tener el link **es** la invitación, como en el Jam. No hay aprobación del dueño;
si se fue de las manos, el dueño saca a quien sobre.

**Por nombre.** Solo el dueño, desde `app/lista/personas.tsx`, con el mismo
`searchContacts` del resto de la app. Que sumar a mano sea del dueño es lo que
mantiene la diferencia entre las dos vías: si cualquier colaborador pudiera
sumar, la vía «controlada» dejaría de serlo.

## Quién puede qué

| | Dueño | Colabora | Un tercero |
| --- | :---: | :---: | :---: |
| Ver la lista y sus canciones | ✓ | ✓ | — |
| Agregar canciones | ✓ | ✓ | — |
| Sacar **cualquier** canción | ✓ | ✓ | — |
| Renombrar, portada, publicar, borrar | ✓ | — | — |
| Sumar y sacar gente | ✓ | — | — |
| Irse | — | ✓ | — |

**Sacar cualquiera, no solo lo suyo.** Es la regla de Spotify y es la que hace
que la lista sea de todos y no de uno con invitados. `added_by` se guarda igual,
para poder mostrar quién trajo qué: es una firma, no un permiso.

**Irse no es deshacer.** Lo que agregaste se queda. Llevarte tus canciones al
salir dejaría la lista de los demás distinta de como la vieron la última vez, y
por una decisión que es solo tuya.

## Las decisiones que importan

**Los permisos son funciones `security definer`, y no por comodidad.** La policy
de `playlists` necesita mirar `playlist_colaboradores`; si esa lectura pasara por
RLS, la policy de colaboradores volvería a mirar `playlists` y Postgres cortaría
con recursión infinita. `puede_editar_lista()` corre como dueña de la función y
esa lectura no vuelve a entrar por las policies.

**El dueño no tiene fila en `playlist_colaboradores`.** Su permiso sale de
`playlists.owner_id`, que no se puede desincronizar. Con una fila para él habría
dos fuentes para la misma verdad, y un borrado a medias dejaría una lista que
nadie puede editar.

**El menú esconde lo que la base va a rechazar.** Un `update` filtrado por RLS
**no falla**: afecta cero filas y vuelve sin error. Si `PlaylistView` ofreciera
«Cambiar el nombre» en una lista ajena, tocarlo no haría nada y tampoco avisaría
— el peor de los dos mundos. Por eso el menú se arma contra `playlist.mia`.

**Un `union` y no un `or` en `list_my_playlists`.** La rama del dueño usa el
índice por `owner_id` y la del colaborador el de `playlist_colaboradores`. Con un
`or`, el planner se queda sin índice para las dos y escanea la tabla entera.

**Las recomendaciones siguen mirando solo tus listas propias.** Lo que sumó otra
persona a una colaborativa está en tu biblioteca, pero no lo elegiste vos, y
dejarlo entrar te devolvería un perfil de gustos que no es el tuyo.

## Probarlo

```bash
docker exec -i supabase_db_dany psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/listas_colaborativas.sql
```

Corre entero adentro de una transacción que termina en `rollback`. Ojo con una
trampa que costó una vuelta: `postgres` es dueño de las tablas y **RLS no se le
aplica** (ninguna tiene `force row level security`), así que sin el
`set local role authenticated` todas las pruebas de «esto no se puede» pasan por
el motivo equivocado.

## Lo que no hace

- **No avisa.** Que alguien sume una canción a una lista tuya no dispara push;
  te enterás al abrirla. El circuito existe (ver `docs/` y `private.push_relay`),
  falta engancharlo.
- **No se actualiza sola mientras mirás.** Si dos personas editan a la vez, cada
  una ve lo suyo hasta recargar. Realtime de Supabase ya se usa para el Jam y
  sería el mismo camino.
- **No muestra quién agregó cada canción.** El dato está en `added_by` desde el
  primer día; falta la columna en la fila.
- **«Empezar una lista con esta canción»**, desde el menú de un tema, sigue
  creando «Mi lista #N» sin preguntar: pasar por la hoja de nombre perdería la
  canción, que es justo el punto de esa acción.
