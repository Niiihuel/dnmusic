/*
 * Las semillas: el gusto **dicho antes de escuchar**.
 *
 * Todo el resto de las señales de gusto es posterior al uso: `plays` necesita
 * que hayas escuchado, `me_gusta` necesita que haya sonado algo para marcar.
 * Esto es lo que la persona elige **antes de todo**, en el onboarding —
 * géneros y artistas con los que arranca la radio sin historial que la
 * alimente. Ver `services/recomendaciones`, donde entran como anclas con un
 * peso chico: a medida que el reloj acumula historia real, las semillas van
 * pesando menos hasta ser un recuerdo del día uno.
 *
 * El género guarda el `params` opaco de YouTube (con él se vuelve a abrir su
 * página) y el artista su id de canal, que es exactamente lo que las anclas
 * necesitan. Nada más: acá no se guardan canciones, solo direcciones.
 *
 * La clave es (dueño, tipo, referencia): elegir dos veces lo mismo es un
 * upsert idempotente, y quitar es borrar la fila. Es un estado, no un evento —
 * el mismo criterio de `me_gusta`.
 */
create table if not exists public.semillas (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('genero', 'artista')),
  ref text not null,
  name text not null default '',
  artwork_url text not null default '',
  at timestamptz not null default now(),
  primary key (owner_id, kind, ref)
);

create index if not exists semillas_mias_idx on public.semillas (owner_id, kind);

alter table public.semillas enable row level security;
grant select, insert, delete on public.semillas to authenticated;

/*
 * Igual que los corazones y el historial: nadie ve las semillas de otro. Que
 * el perfil sea público no convierte esto en vitrina; si algún día se muestra
 * «tu música», será una copia explícita y no esta tabla abierta.
 */
create policy "cada quien ve sus semillas"
  on public.semillas for select to authenticated
  using (owner_id = auth.uid());

create policy "cada quien planta las suyas"
  on public.semillas for insert to authenticated
  with check (owner_id = auth.uid());

create policy "cada quien arranca las suyas"
  on public.semillas for delete to authenticated
  using (owner_id = auth.uid());
