/*
 * Reaccionar a lo que alguien escucha — el corazón de Airbuds, adaptado.
 *
 * Tres piezas, en orden de dependencia:
 *
 *   1. **Ver qué escucha un contacto.** La fila `escuchas` es estrictamente
 *      privada (policy `own escucha`) y eso no cambia: se abre una ventana
 *      puntual por RPC, solo para contactos y solo la parte que se muestra —
 *      la canción y si suena. La posición, el aparato y la revisión son
 *      mecánica interna del traspaso y no le importan a nadie más.
 *
 *   2. **Reaccionar.** Un contacto le deja un emoji a lo que está sonando. La
 *      canción NO viene del cliente: el servidor la lee de `escuchas` en ese
 *      momento y la congela en la fila. Es lo que hace honesta a la reacción
 *      —reaccionaste a lo que de verdad sonaba— y lo que impide inventarle a
 *      alguien una reacción sobre una canción que nunca escuchó.
 *
 *   3. **Verlas en su perfil.** Las reacciones son del perfil del que escucha:
 *      las ve quien puede ver ese perfil (él mismo, sus contactos, o
 *      cualquiera si el perfil es público). La instantánea ya está congelada,
 *      así que mostrarla no revela nada de la escucha en vivo.
 *
 * Contacto quiere decir lo de siempre en esta app: comparten un par. No hay
 * reacciones entre desconocidos — la escucha en vivo es de tu gente.
 */

-- ── Quiénes son contactos, como función ─────────────────────────────────────
--
-- La subconsulta de «comparten un par» ya está escrita a mano en tres lugares
-- (search_contacts, get_profile, acá). Se extrae con nombre porque las policies
-- de abajo la necesitan y con `security definer`: `pair_members` tiene RLS y
-- desde una policy ajena la lectura volvería vacía.

create or replace function public.son_contactos(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pair_members mine
    join public.pair_members other on other.pair_id = mine.pair_id
    where mine.user_id = a and other.user_id = b and a <> b
  );
$$;

revoke all on function public.son_contactos(uuid, uuid) from public;
grant execute on function public.son_contactos(uuid, uuid) to authenticated;

-- ── 1. La ventana a la escucha de un contacto ───────────────────────────────

create or replace function public.escucha_de_contacto(p_usuario uuid)
returns table (
  track      jsonb,
  suena      boolean,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select e.track, e.suena, e.updated_at
  from public.escuchas e
  where e.user_id = p_usuario
    and e.track is not null
    and public.son_contactos(auth.uid(), p_usuario)
    and not public.hay_bloqueo(auth.uid(), p_usuario);
$$;

revoke all on function public.escucha_de_contacto(uuid) from public;
grant execute on function public.escucha_de_contacto(uuid) to authenticated;

-- ── 2. Las reacciones ───────────────────────────────────────────────────────

create table if not exists public.reacciones_escucha (
  id         uuid primary key default gen_random_uuid(),
  de_user    uuid not null references auth.users(id) on delete cascade,
  para_user  uuid not null references auth.users(id) on delete cascade,
  /* Un emoji, no un texto: hasta 16 bytes cubre cualquier emoji compuesto
     (banderas, tonos de piel) sin dejar lugar a una frase. */
  emoji      text not null check (length(btrim(emoji)) between 1 and 16),
  /* La canción congelada en el momento de reaccionar: videoId, title, artist,
     artworkUrl. Desnormalizada como todo lo que tiene que sobrevivir — la
     reacción sigue diciendo a qué fue aunque la escucha ya sea otra. */
  track      jsonb not null,
  created_at timestamptz not null default now(),
  check (de_user <> para_user)
);

create index if not exists reacciones_perfil_idx
  on public.reacciones_escucha (para_user, created_at desc);

alter table public.reacciones_escucha enable row level security;
grant select on public.reacciones_escucha to authenticated;

/*
 * Lectura directa solo para las dos puntas: es lo que necesita realtime para
 * avisarle al que recibe («postgres_changes» respeta RLS). El perfil de un
 * tercero las pide por la RPC de abajo, que aplica la visibilidad del perfil.
 * Insertar no tiene policy: el único camino es la función, que congela la
 * canción del lado del servidor.
 */
drop policy if exists "las reacciones las ven sus puntas" on public.reacciones_escucha;
create policy "las reacciones las ven sus puntas"
  on public.reacciones_escucha for select to authenticated
  using (para_user = auth.uid() or de_user = auth.uid());

create or replace function public.reaccionar_escucha(p_para uuid, p_emoji text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_track jsonb;
  v_id    uuid;
begin
  if not public.son_contactos(auth.uid(), p_para)
     or public.hay_bloqueo(auth.uid(), p_para) then
    raise exception 'Solo se reacciona a la música de tus contactos';
  end if;

  select e.track into v_track from public.escuchas e where e.user_id = p_para;
  if v_track is null then
    raise exception 'Ahí no está sonando nada';
  end if;

  insert into public.reacciones_escucha (de_user, para_user, emoji, track)
  values (auth.uid(), p_para, btrim(p_emoji), v_track)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reaccionar_escucha(uuid, text) from public;
grant execute on function public.reaccionar_escucha(uuid, text) to authenticated;

-- ── 3. Las reacciones de un perfil ──────────────────────────────────────────
--
-- Con quién las firmó: el perfil las muestra como «🔥 de @fulano a “K.”».
-- La visibilidad es la del perfil: uno mismo, un contacto, o cualquiera si el
-- perfil es público — el mismo criterio que las vitrinas (`vitrinas_lectura`).

create or replace function public.reacciones_de(p_usuario uuid, p_limit integer default 12)
returns table (
  id           uuid,
  emoji        text,
  track        jsonb,
  created_at   timestamptz,
  de_user      uuid,
  username     text,
  display_name text,
  avatar_path  text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select r.id, r.emoji, r.track, r.created_at,
         r.de_user, p.username, p.display_name, p.avatar_path
  from public.reacciones_escucha r
  left join public.profiles p on p.user_id = r.de_user
  where r.para_user = p_usuario
    and (
      p_usuario = auth.uid()
      or public.son_contactos(auth.uid(), p_usuario)
      or public.perfil_es_publico(p_usuario)
    )
    and not public.hay_bloqueo(auth.uid(), p_usuario)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.reacciones_de(uuid, integer) from public;
grant execute on function public.reacciones_de(uuid, integer) to authenticated;

-- El aviso en vivo para el que recibe: la tabla entra al canal de realtime.
-- REPLICA IDENTITY FULL para que el evento traiga la fila completa — el
-- oyente arma el aviso sin un segundo viaje.
do $$
begin
  alter publication supabase_realtime add table public.reacciones_escucha;
exception
  when duplicate_object then null;
end
$$;

alter table public.reacciones_escucha replica identity full;
