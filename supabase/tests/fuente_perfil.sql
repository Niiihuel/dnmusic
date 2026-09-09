-- Ejecutar con psql -v ON_ERROR_STOP=1 después de las migraciones. No deja datos.
begin;
insert into auth.users (id, email, raw_app_meta_data) values
 ('00000000-0000-4000-8000-0000000000f1','fuente_prueba@example.test', '{"provider":"google"}'),
 ('00000000-0000-4000-8000-0000000000f2','fuente_visita@example.test', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000f1',
 '00000000-0000-4000-8000-0000000000f2');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p record; nueva text;
begin
 select * into p from public.update_my_profile(p_username => 'fuente_prueba', p_fuente => 'revista');
 if p.fuente <> 'revista' then raise exception 'No guardó la fuente'; end if;
 -- La firma antigua sigue resolviendo y conserva el ajuste nuevo.
 select * into p from public.update_my_profile(p_display_name => 'Prueba');
 if p.fuente <> 'revista' then raise exception 'Un cliente antiguo borró la fuente'; end if;
 begin
   perform public.update_my_profile(p_fuente => 'inexistente');
   raise exception 'Aceptó una fuente desconocida';
 exception when check_violation then null;
 end;
 foreach nueva in array array['editorial','geometrica','urbana','caligrafica','suave','clasica'] loop
   select * into p from public.update_my_profile(p_fuente => nueva);
   if p.fuente is distinct from nueva then raise exception 'No guardó %', nueva; end if;
 end loop;
 perform public.update_my_profile(p_fuente => 'revista');
 select * into p from public.get_my_profile();
 if p.fuente <> 'revista' then raise exception 'No devuelve la fuente propia'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
do $$ begin
 if exists(select 1 from public.get_profile('fuente_prueba')) then raise exception 'Expuso el perfil privado'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select user_id from public.update_my_profile(p_visibility => 'publico');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
do $$ declare p record; nueva text; begin
 select * into p from public.get_profile('fuente_prueba');
 if p.fuente is distinct from 'revista' then raise exception 'El visitante no recibe la fuente'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
do $$ declare p record; nueva text; begin
 select * into p from public.update_my_profile(p_fuente => '');
 if p.fuente is not null then raise exception 'No permite volver al sistema'; end if;
end $$;
rollback;
