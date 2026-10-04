-- Ejecutar contra una base local con dos contactos y una tercera cuenta.
-- Todo se revierte, incluido el cambio temporal de visibilidad.
begin;
do $$
declare
  duenio uuid;
  contacto uuid;
  desconocido uuid;
  nombre text;
begin
  select a.user_id, b.user_id into duenio, contacto
  from public.pair_members a
  join public.pair_members b on b.pair_id = a.pair_id and b.user_id <> a.user_id
  limit 1;
  select p.user_id into desconocido from public.profiles p
  where p.user_id not in (duenio, contacto)
    and not app_private.son_contactos(p.user_id, duenio)
  limit 1;
  if duenio is null or contacto is null or desconocido is null then
    raise exception 'La prueba requiere dos contactos y una tercera cuenta';
  end if;
  update public.profiles set visibility = 'privado' where user_id = duenio
  returning username into nombre;

  perform set_config('request.jwt.claim.sub', contacto::text, true);
  if not public.perfil_puede_ver(duenio) then
    raise exception 'Un contacto no puede ver el perfil privado';
  end if;
  if not exists (select 1 from public.get_profile(nombre)) then
    raise exception 'get_profile no devuelve el perfil al contacto';
  end if;

  insert into public.blocks(blocker, blocked) values (duenio, contacto);
  if public.perfil_puede_ver(duenio) or exists (select 1 from public.get_profile(nombre)) then
    raise exception 'El bloqueo no prevalece sobre la amistad';
  end if;

  perform set_config('request.jwt.claim.sub', desconocido::text, true);
  if public.perfil_puede_ver(duenio) then
    raise exception 'Un desconocido puede ver el perfil privado';
  end if;
  if exists (select 1 from public.get_profile(nombre)) then
    raise exception 'get_profile filtra mal el perfil privado';
  end if;

  perform set_config('request.jwt.claim.sub', duenio::text, true);
  if not public.perfil_puede_ver(duenio) then
    raise exception 'El dueño no puede ver su perfil';
  end if;
end;
$$;
rollback;
