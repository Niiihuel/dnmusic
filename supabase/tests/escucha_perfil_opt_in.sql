-- Ejecutar contra Supabase local con la migración 20260915000000 aplicada.
begin;
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-4000-8000-0000000000f1','escuchaowner@flora.local', '{"provider":"google"}'),
 ('00000000-0000-4000-8000-0000000000f2','escuchacontact@flora.local', '{"provider":"google"}'),
 ('00000000-0000-4000-8000-0000000000f3','escuchaother@flora.local', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000f1',
 '00000000-0000-4000-8000-0000000000f2',
 '00000000-0000-4000-8000-0000000000f3');
insert into public.pairs (id) values ('00000000-0000-4000-8000-00000000ff01');
insert into public.pair_members (pair_id,user_id) values
 ('00000000-0000-4000-8000-00000000ff01','00000000-0000-4000-8000-0000000000f1'),
 ('00000000-0000-4000-8000-00000000ff01','00000000-0000-4000-8000-0000000000f2');
insert into public.escuchas (user_id,device_id,device_nombre,track,suena)
 values ('00000000-0000-4000-8000-0000000000f1','device','PC','{"videoId":"one","title":"Canción","artist":"Artista"}',true);

create function pg_temp.como(u uuid) returns void language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
$$;
create function pg_temp.andamio(q text) returns void language plpgsql as $$
begin
 perform set_config('role','postgres',true); execute q;
 perform set_config('role','authenticated',true);
end;
$$;
create function pg_temp.oculta(u uuid) returns void language plpgsql as $$
declare aceptada boolean := false;
begin
 if exists(select 1 from public.escucha_de_contacto(u)) then raise exception 'Se filtró una escucha oculta'; end if;
 begin
  perform public.reaccionar_escucha(u,'🔥'); aceptada := true;
 exception when others then
  if sqlerrm not in ('Ahí no está sonando nada','Solo se reacciona a la música de tus contactos') then raise; end if;
 end;
 if aceptada then raise exception 'Se pudo reaccionar a una escucha oculta'; end if;
end;
$$;

set local role authenticated;
do $$
declare
 owner_id constant uuid := '00000000-0000-4000-8000-0000000000f1';
 contact_id constant uuid := '00000000-0000-4000-8000-0000000000f2';
 other_id constant uuid := '00000000-0000-4000-8000-0000000000f3';
 value boolean;
begin
 -- Default seguro, también para el dueño de la vista previa.
 perform pg_temp.como(owner_id);
 select compartir_escucha into value from public.get_my_profile();
 if value is distinct from false then raise exception 'La escucha debe ser opt-in'; end if;
 perform pg_temp.oculta(owner_id);
 perform public.update_my_profile(p_visibility => 'publico');
 perform pg_temp.como(contact_id); perform pg_temp.oculta(owner_id);
 -- Activar por la misma RPC que usa Guardar cambios.
 perform pg_temp.como(owner_id);
 select compartir_escucha into value from public.update_my_profile(p_compartir_escucha => true);
 if value is distinct from true then raise exception 'No guardó opt-in'; end if;
 select compartir_escucha into value from public.update_my_profile(p_bio => 'Conservar preferencia');
 if value is distinct from true then raise exception 'Cliente anterior borró preferencia'; end if;
 if (select count(*) from public.escucha_de_contacto(owner_id)) <> 1 then raise exception 'Falta vista propia'; end if;
 perform pg_temp.como(contact_id);
 if (select track->>'videoId' from public.escucha_de_contacto(owner_id)) is distinct from 'one' then raise exception 'Contacto no ve escucha fresca'; end if;
 perform public.reaccionar_escucha(owner_id,'🔥');
 if exists(select 1 from public.escuchas where user_id=owner_id) then raise exception 'RLS expone traspaso'; end if;
 perform pg_temp.como(other_id); perform pg_temp.oculta(owner_id);
 -- Pausa y desconexión (latido vencido), sin filtrar la última canción.
 perform pg_temp.como(contact_id);
 perform pg_temp.andamio(format('update public.escuchas set suena=false where user_id=%L',owner_id));
 perform pg_temp.oculta(owner_id);
 perform pg_temp.andamio(format('update public.escuchas set suena=true, updated_at=now()-interval ''66 seconds'' where user_id=%L',owner_id));
 perform pg_temp.oculta(owner_id);
 perform pg_temp.andamio(format('update public.escuchas set updated_at=now()+interval ''66 seconds'' where user_id=%L',owner_id));
 perform pg_temp.oculta(owner_id);
 perform pg_temp.andamio(format('update public.escuchas set updated_at=now()-interval ''65 seconds'' where user_id=%L',owner_id));
 if not exists(select 1 from public.escucha_de_contacto(owner_id)) then raise exception 'Debe respetar límite de 65s'; end if;
 perform pg_temp.andamio(format('update public.escuchas set updated_at=now() where user_id=%L',owner_id));
 -- Revocar privacidad mientras la canción sigue sonando.
 perform pg_temp.como(owner_id); perform public.update_my_profile(p_visibility=>'privado');
 perform pg_temp.como(contact_id); perform pg_temp.oculta(owner_id);
 perform pg_temp.como(owner_id); perform public.update_my_profile(p_visibility=>'publico',p_compartir_escucha=>false);
 perform pg_temp.como(contact_id); perform pg_temp.oculta(owner_id);
 perform pg_temp.como(owner_id);
 select compartir_escucha into value from public.get_my_profile();
 if value is distinct from false then raise exception 'No persistió opt-out'; end if;
 perform public.update_my_profile(p_compartir_escucha=>true);
 -- Bloqueo en cualquiera de las direcciones.
 perform pg_temp.andamio(format('insert into public.blocks(blocker,blocked) values(%L,%L)',owner_id,contact_id));
 perform pg_temp.como(contact_id); perform pg_temp.oculta(owner_id);
 perform pg_temp.andamio(format('delete from public.blocks where blocker=%L and blocked=%L',owner_id,contact_id));
 perform pg_temp.andamio(format('insert into public.blocks(blocker,blocked) values(%L,%L)',contact_id,owner_id));
 perform pg_temp.oculta(owner_id);
 -- Sin sesión no existe vía alternativa de lectura/escritura.
 perform pg_temp.como(null);
 begin
  perform public.escucha_de_contacto(owner_id);
  raise exception 'Sin sesión obtuvo acceso al RPC';
 exception when insufficient_privilege then null; end;
 begin
  perform public.reaccionar_escucha(owner_id,'🔥');
  raise exception 'Sin sesión obtuvo acceso a reacciones';
 exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'ESCUCHA OPT-IN OK' as resultado;
rollback;
