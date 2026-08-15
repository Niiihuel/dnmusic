/*
 * Los me gusta.
 *
 * Hasta acá la única señal de gusto era **implícita**: cuánto tiempo dejaste
 * sonar a cada artista (`plays`). Alcanza para ordenar, pero no distingue «lo
 * dejé de fondo» de «esto me encanta» — y esa distinción es exactamente lo que
 * un corazón dice gratis. Las recomendaciones lo usan como refuerzo: un
 * artista con corazones pesa más como ancla, aunque el reloj diga poco de él.
 *
 * Se guarda **la canción entera** —audio incluido— y no solo el video_id, por
 * lo mismo que `playlist_tracks`: la vista «Tus me gusta» tiene que poder
 * sonar sin volver a resolver nada contra YouTube. Marcar es gratis porque lo
 * que se marca ya está resuelto: estaba sonando.
 *
 * La clave es (dueño, video): un corazón por canción, y volver a marcarla es
 * un upsert idempotente, no una fila más. Quitarlo es borrar la fila — acá no
 * hay historia que preservar, a diferencia de `plays`: un gusto es un estado,
 * no un evento.
 */
create table if not exists public.me_gusta (
  owner_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null default '',
  artist text not null default '',
  artist_id text,
  artwork_url text not null default '',
  artwork_path text,
  audio_path text not null,
  duration_ms integer not null default 0,
  true_peak real,
  at timestamptz not null default now(),
  primary key (owner_id, video_id)
);

/* La consulta es siempre «los míos, del más nuevo al más viejo»: la vista los
 * lista así y las recomendaciones los leen todos de una. */
create index if not exists me_gusta_mios_idx on public.me_gusta (owner_id, at desc);

alter table public.me_gusta enable row level security;
grant select, insert, delete on public.me_gusta to authenticated;

/*
 * Nadie ve los gustos de otro. Igual que el historial: un perfil público no
 * convierte tus corazones en públicos. Si algún día se comparten, será como
 * agregado o vitrina explícita, no abriendo esta tabla.
 *
 * Sin `update`: los datos de la canción se escriben al marcar y listo. Marcar
 * dos veces es un `on conflict do nothing` del lado del cliente, no una
 * reescritura. Menos verbos, menos formas de romperla.
 */
create policy "cada quien ve sus me gusta"
  on public.me_gusta for select to authenticated
  using (owner_id = auth.uid());

create policy "cada quien marca los suyos"
  on public.me_gusta for insert to authenticated
  with check (owner_id = auth.uid());

create policy "cada quien quita los suyos"
  on public.me_gusta for delete to authenticated
  using (owner_id = auth.uid());
