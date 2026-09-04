/*
 * Reaccionar a una pieza del perfil de otro — el gesto del Space de Airbuds.
 *
 * Hasta acá se reaccionaba a **lo que suena** (`reacciones_escucha`): una
 * reacción por vez, congelada con la canción de ese momento, que se acumula en
 * la pared del perfil. Esto es otra cosa, y por eso es otra tabla: se
 * reacciona a **una vitrina**, que es algo que su dueño eligió mostrar y que
 * sigue ahí. No hay nada que congelar —la pieza ya es la instantánea— y no
 * tiene sentido acumular: lo que se quiere leer sobre cada pieza es «🔥 3
 * 💜 1», como abajo de una foto, no una lista de todas las veces que alguien
 * pasó.
 *
 * De ahí las tres decisiones de forma:
 *
 *   · **Una por persona y por pieza** (`unique (showcase_id, de)`). Reaccionar
 *     de nuevo reemplaza el emoji; mandar vacío la saca. Es lo que hace que la
 *     cuenta signifique «cuántas personas», que es lo único que vale la pena
 *     contar.
 *   · **Cae con la vitrina** (`on delete cascade`). Una reacción a una pieza
 *     que ya no existe no le habla a nadie.
 *   · **Se leen todas juntas**, agrupadas por pieza y emoji, en una sola
 *     consulta por mosaico. Pedirlas por vitrina serían veinte viajes para
 *     dibujar un perfil.
 *
 * La visibilidad es la de la vitrina misma: quien puede ver la pieza puede
 * ver lo que le dejaron. Hoy una vitrina se ve si es tuya o si el perfil es
 * público (`las vitrinas se miran si el perfil es público`), y ese es
 * exactamente el criterio de acá — no el de contactos que usa la escucha en
 * vivo, porque las vitrinas no son de tu gente, son de cualquiera que te
 * encuentre. Y a una pieza propia no se le reacciona: se puede ver la cuenta,
 * pero inflarla uno mismo la vuelve mentira.
 */

-- ── La tabla ────────────────────────────────────────────────────────────────

create table if not exists public.reacciones_vitrina (
  id          uuid primary key default gen_random_uuid(),
  showcase_id uuid not null references public.profile_showcases(id) on delete cascade,
  de          uuid not null references auth.users(id) on delete cascade,
  /* Un emoji, no un texto: hasta 16 bytes cubre cualquier emoji compuesto
     (banderas, tonos de piel) sin dejar lugar a una frase. El mismo límite
     que `reacciones_escucha`. */
  emoji       text not null check (length(btrim(emoji)) between 1 and 16),
  created_at  timestamptz not null default now(),
  unique (showcase_id, de)
);

/* Las reacciones de un mosaico se piden por dueño, y el dueño está en la
   vitrina, así que el índice útil es por pieza — el unique ya lo da con
   `showcase_id` primero. */

alter table public.reacciones_vitrina enable row level security;
grant select, insert, update, delete on public.reacciones_vitrina to authenticated;

-- ── Quién puede ver una vitrina, como función ───────────────────────────────
--
-- Es la pregunta que hacen las policies de abajo, y va con `security definer`
-- por lo mismo que `perfil_es_publico`: desde una policy, la lectura de
-- `profile_showcases` corre como el rol que llama y con su RLS puesta, y
-- `hay_bloqueo` está revocada para `authenticated` a propósito. Acá se mira
-- con permisos propios y sale un booleano, nada más.

create or replace function public.vitrina_visible(p_showcase uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profile_showcases s
    where s.id = p_showcase
      and (s.owner_id = auth.uid() or public.perfil_es_publico(s.owner_id))
      and not public.hay_bloqueo(auth.uid(), s.owner_id)
  );
$$;

-- El dueño de una pieza, para la regla de «a la propia no». Mismo criterio de
-- permisos que la de arriba.
create or replace function public.duena_de_vitrina(p_showcase uuid)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select s.owner_id from public.profile_showcases s where s.id = p_showcase;
$$;

revoke all on function public.vitrina_visible(uuid) from public;
revoke all on function public.duena_de_vitrina(uuid) from public;
grant execute on function public.vitrina_visible(uuid) to authenticated;
grant execute on function public.duena_de_vitrina(uuid) to authenticated;

-- ── Las policies ────────────────────────────────────────────────────────────
--
-- Leer: lo que le dejaron a una pieza lo ve quien puede ver la pieza.
-- Escribir: solo lo propio, y nunca sobre una pieza propia. El camino normal
-- es la función de abajo, pero las policies dicen lo mismo por si alguien
-- llega derecho a la tabla — y son lo que realtime respeta si algún día se
-- escucha en vivo.

drop policy if exists "las reacciones a una vitrina las ve quien ve la vitrina" on public.reacciones_vitrina;
create policy "las reacciones a una vitrina las ve quien ve la vitrina"
  on public.reacciones_vitrina for select to authenticated
  using (public.vitrina_visible(showcase_id));

drop policy if exists "se reacciona a las vitrinas ajenas que se ven" on public.reacciones_vitrina;
create policy "se reacciona a las vitrinas ajenas que se ven"
  on public.reacciones_vitrina for insert to authenticated
  with check (
    de = auth.uid()
    and public.vitrina_visible(showcase_id)
    and public.duena_de_vitrina(showcase_id) <> auth.uid()
  );

drop policy if exists "cada quien cambia su reacción" on public.reacciones_vitrina;
create policy "cada quien cambia su reacción"
  on public.reacciones_vitrina for update to authenticated
  using (de = auth.uid())
  with check (de = auth.uid() and public.duena_de_vitrina(showcase_id) <> auth.uid());

drop policy if exists "cada quien saca su reacción" on public.reacciones_vitrina;
create policy "cada quien saca su reacción"
  on public.reacciones_vitrina for delete to authenticated
  using (de = auth.uid());

-- ── Reaccionar ──────────────────────────────────────────────────────────────
--
-- Un solo verbo para las tres cosas —dejar, cambiar, sacar— porque desde la
-- pantalla son el mismo gesto: tocar un emoji. Con el emoji vacío (o nulo) se
-- saca; con otro se reemplaza. `created_at` se renueva al cambiar: la
-- reacción que cuenta es la última que se dejó.

create or replace function public.reaccionar_vitrina(p_showcase uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;
  if not public.vitrina_visible(p_showcase) then
    raise exception 'Esa pieza no está a la vista';
  end if;
  if public.duena_de_vitrina(p_showcase) = auth.uid() then
    raise exception 'A tus propias piezas no se les reacciona';
  end if;

  if v_emoji = '' then
    delete from public.reacciones_vitrina
    where showcase_id = p_showcase and de = auth.uid();
    return;
  end if;

  insert into public.reacciones_vitrina (showcase_id, de, emoji)
  values (p_showcase, auth.uid(), v_emoji)
  on conflict (showcase_id, de) do update
    set emoji = excluded.emoji,
        created_at = now();
end;
$$;

revoke all on function public.reaccionar_vitrina(uuid, text) from public;
grant execute on function public.reaccionar_vitrina(uuid, text) to authenticated;

-- ── Las reacciones de un mosaico entero ─────────────────────────────────────
--
-- Una fila por (pieza, emoji) con la cuenta, y si entre las que suman está la
-- de quien llama: es todo lo que el perfil dibuja. Se pide por dueño y no por
-- vitrina para que el mosaico sea una consulta y no una por pieza.
--
-- La visibilidad se decide una vez sobre el dueño —mismo criterio que
-- `vitrina_visible`, pero sin repetirlo veinte veces— y con perfil privado o
-- bloqueo la respuesta es vacía, indistinguible de «nadie reaccionó».

create or replace function public.reacciones_de_vitrinas(p_owner uuid)
returns table (
  showcase_id uuid,
  emoji       text,
  cuenta      bigint,
  mia         boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select r.showcase_id, r.emoji, count(*)::bigint, bool_or(r.de = auth.uid())
  from public.reacciones_vitrina r
  join public.profile_showcases s on s.id = r.showcase_id
  where s.owner_id = p_owner
    and (p_owner = auth.uid() or public.perfil_es_publico(p_owner))
    and not public.hay_bloqueo(auth.uid(), p_owner)
  group by r.showcase_id, r.emoji;
$$;

revoke all on function public.reacciones_de_vitrinas(uuid) from public;
grant execute on function public.reacciones_de_vitrinas(uuid) to authenticated;
