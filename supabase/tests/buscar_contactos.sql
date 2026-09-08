-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de `search_contacts`: que encuentre a quien buscás y que **no** deje
-- pasearse por las cuentas de la app.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/buscar_contactos.sql
--
-- Lo que se prueba de verdad es lo segundo. Que «buscar a alguien lo encuentra»
-- se rompe fuerte y se nota; que «una letra suelta te devuelve media base» no
-- se nota nunca, y es el que importa.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'buscadora@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'martina@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'marcos@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000d4', 'ana@flora.local', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000d1',
 '00000000-0000-4000-8000-0000000000d2',
 '00000000-0000-4000-8000-0000000000d3',
 '00000000-0000-4000-8000-0000000000d4');

update public.profiles set username = 'buscadora'
  where user_id = '00000000-0000-4000-8000-0000000000d1';
update public.profiles set username = 'martina', display_name = 'Martina Paz'
  where user_id = '00000000-0000-4000-8000-0000000000d2';
update public.profiles set username = 'marcos'
  where user_id = '00000000-0000-4000-8000-0000000000d3';
-- El usuario más corto que la app permite (3 letras: `is_valid_username`).
-- Tiene que ser alcanzable escribiéndolo entero, que es el mínimo de búsqueda.
update public.profiles set username = 'ana'
  where user_id = '00000000-0000-4000-8000-0000000000d4';

create function pg_temp.como(u uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text,
    true
  );
$$;

/* Cuántas de las cuentas de prueba devuelve una consulta. Se filtra a las
   nuestras porque la base local tiene gente de otras corridas. */
create function pg_temp.cuantas(q text) returns integer
language sql as $$
  select count(*)::integer from public.search_contacts(q, 30)
  where username in ('buscadora', 'martina', 'marcos', 'ana');
$$;

set local role authenticated;

do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000d1';
  n   integer;
begin
  perform pg_temp.como(ana);

  -- ── Lo que NO tiene que devolver nada ────────────────────────────────────
  n := pg_temp.cuantas('');
  if n <> 0 then
    raise exception 'FALLO: la consulta vacía devolvió % cuentas; tiene que ser 0', n;
  end if;

  n := pg_temp.cuantas('   ');
  if n <> 0 then
    raise exception 'FALLO: solo espacios devolvió % cuentas', n;
  end if;

  -- Una letra suelta: el agujero viejo. «m» agarraba martina y marcos.
  n := pg_temp.cuantas('m');
  if n <> 0 then
    raise exception 'FALLO: una sola letra devolvió % cuentas', n;
  end if;

  n := pg_temp.cuantas('ma');
  if n <> 0 then
    raise exception 'FALLO: dos letras devolvieron % cuentas', n;
  end if;

  -- Substring: buscar por el medio ya no encuentra nada.
  n := pg_temp.cuantas('rtina');
  if n <> 0 then
    raise exception 'FALLO: buscar por el medio del nombre devolvió % cuentas', n;
  end if;
  n := pg_temp.cuantas('arcos');
  if n <> 0 then
    raise exception 'FALLO: substring de un usuario devolvió % cuentas', n;
  end if;

  -- ── Lo que SÍ tiene que encontrar ────────────────────────────────────────
  -- Tres letras desde el principio.
  n := pg_temp.cuantas('mar');
  if n <> 2 then
    raise exception 'FALLO: «mar» tenía que traer martina y marcos, trajo %', n;
  end if;

  n := pg_temp.cuantas('marti');
  if n <> 1 then
    raise exception 'FALLO: «marti» tenía que traer solo a martina, trajo %', n;
  end if;

  -- Por el nombre visible, no solo por el usuario.
  n := pg_temp.cuantas('Martina P');
  if n <> 1 then
    raise exception 'FALLO: buscar por el nombre visible trajo %', n;
  end if;

  -- El usuario más corto posible, escrito entero: el mínimo de tres letras
  -- nunca deja a nadie sin poder ser encontrado.
  n := pg_temp.cuantas('ana');
  if n <> 1 then
    raise exception 'FALLO: el usuario más corto «ana» trajo %', n;
  end if;

  -- Y no distingue mayúsculas.
  n := pg_temp.cuantas('ANA');
  if n <> 1 then
    raise exception 'FALLO: «ANA» en mayúsculas trajo %', n;
  end if;
  n := pg_temp.cuantas('MARti');
  if n <> 1 then
    raise exception 'FALLO: «MARti» trajo %', n;
  end if;

  -- Uno mismo nunca aparece en su propia búsqueda.
  n := pg_temp.cuantas('buscadora');
  if n <> 0 then
    raise exception 'FALLO: la propia cuenta aparece en su búsqueda';
  end if;

  -- El usuario exacto va primero cuando compite con un prefijo.
  if (select username from public.search_contacts('marcos', 30) limit 1) <> 'marcos' then
    raise exception 'FALLO: el usuario exacto no quedó primero';
  end if;
end;
$$;

reset role;

select 'BUSCAR CONTACTOS OK: todas las pruebas pasaron' as resultado;

rollback;
