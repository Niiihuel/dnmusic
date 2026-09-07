-- Ejecutar con psql -v ON_ERROR_STOP=1 después de las migraciones, en una DB local.
-- Las cuentas y todos los cambios se revierten al terminar.
begin;
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-0000000000d1', 'catalogo_prueba@example.test'),
 ('00000000-0000-4000-8000-0000000000d2', 'catalogo_visita@example.test');

-- Solo una firma de guardado, con todos los argumentos opcionales; RLS sigue activa.
do $$
declare f record;
begin
 if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname = 'update_my_profile') <> 1 then
   raise exception 'Quedaron sobrecargas ambiguas de update_my_profile';
 end if;
 if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
   raise exception 'Se desactivó RLS de profiles';
 end if;
 for f in select oid, proname, pronargs, pronargdefaults, prosecdef, proconfig
          from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('get_my_profile', 'get_profile', 'update_my_profile') loop
   if not f.prosecdef or not ('search_path=public, pg_temp' = any(f.proconfig)) then
     raise exception 'Cambió la seguridad de %', f.proname;
   end if;
   if has_function_privilege('anon', f.oid, 'EXECUTE')
      or not has_function_privilege('authenticated', f.oid, 'EXECUTE') then
     raise exception 'Grants incorrectos de %', f.proname;
   end if;
   if f.proname = 'update_my_profile' and (f.pronargs <> 14 or f.pronargdefaults <> 14) then
     raise exception 'El guardado perdió argumentos opcionales';
   end if;
 end loop;
 -- La restricción también existe al escribir directamente como administrador.
 begin
   update public.profiles set marco_perfil = ''
   where user_id = '00000000-0000-4000-8000-0000000000d1';
   raise exception 'La columna admitió una cadena vacía';
 exception when check_violation then null;
 end;
 begin
   update public.profiles set marco_perfil = repeat('x', 201)
   where user_id = '00000000-0000-4000-8000-0000000000d1';
   raise exception 'La columna admitió más de 200 caracteres';
 exception when check_violation then null;
 end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p record; antes jsonb; campo text; consulta text; limite text := 'discord:' || repeat('x', 192);
begin
 select * into p from public.get_my_profile();
 if p.user_id is distinct from '00000000-0000-4000-8000-0000000000d1'::uuid
    or p.marco_perfil is not null then
   raise exception 'El nuevo cosmético debe comenzar vacío';
 end if;
 -- El cliente tiene que pasar por RPC, no puede leer ni escribir la tabla.
 begin
   perform marco_perfil from public.profiles;
   raise exception 'authenticated pudo leer directamente profiles';
 exception when insufficient_privilege then null;
 end;
 begin
   update public.profiles set marco_perfil = 'intruso';
   raise exception 'authenticated pudo escribir directamente profiles';
 exception when insufficient_privilege then null;
 end;

 select * into p from public.update_my_profile(
   p_username => '  CATALOGO_PRUEBA  ', p_display_name => ' Prueba ',
   p_bio => ' Mi perfil ', p_avatar_path => ' avatar.gif ', p_banner_path => ' banner.webp ',
   p_fuente => 'revista', p_tema => '{"id":"negro"}',
   p_avatar_encuadre => '{"x":0,"y":0,"escala":2}',
   p_banner_encuadre => '{"x":1,"y":-1,"escala":3}',
   p_marco => 'discord:123456789012345678', p_efecto => 'discord:223456789012345678',
   p_placa => 'discord:323456789012345678:variant-blue',
   p_marco_perfil => ' discord:423456789012345678:variant-dark ');
 if p.username is distinct from 'catalogo_prueba' or p.display_name is distinct from 'Prueba'
    or p.bio is distinct from 'Mi perfil' or p.avatar_path is distinct from 'avatar.gif'
    or p.banner_path is distinct from 'banner.webp' or p.visibility is distinct from 'privado'
    or p.marco is distinct from 'discord:123456789012345678'
    or p.efecto is distinct from 'discord:223456789012345678'
    or p.placa is distinct from 'discord:323456789012345678:variant-blue'
    or p.marco_perfil is distinct from 'discord:423456789012345678:variant-dark' then
   raise exception 'No guardó y devolvió el paquete completo o cambió los campos previos';
 end if;
 antes := to_jsonb(p);
 select * into p from public.get_my_profile();
 if to_jsonb(p) is distinct from antes then raise exception 'La lectura propia no coincide con el guardado'; end if;
 select * into p from public.get_profile(' CATALOGO_PRUEBA ');
 if p.marco_perfil is distinct from antes->>'marco_perfil' then
   raise exception 'El dueño no puede leer su perfil privado';
 end if;

 -- Omitir, enviar NULL o usar los trece argumentos posicionales anteriores conserva todo.
 perform public.update_my_profile();
 perform public.update_my_profile(p_marco_perfil => null);
 perform public.update_my_profile(null, null, null, null, null, null, null, null, null, null, null, null, null);
 select * into p from public.get_my_profile();
 if to_jsonb(p) is distinct from antes then raise exception 'Un cliente anterior borró ajustes'; end if;
 select * into p from public.update_my_profile(p_display_name => 'Otro nombre');
 if (to_jsonb(p) - 'display_name') is distinct from (antes - 'display_name') then
   raise exception 'Editar el nombre modificó los cosméticos u otros ajustes';
 end if;
 antes := to_jsonb(p);

 -- Una pieza inválida debe cancelar las cuatro, además del resto de la edición.
 foreach campo in array array['marco', 'efecto', 'placa', 'marco_perfil'] loop
   begin
     perform public.update_my_profile(
       p_display_name => 'No persistir',
       p_marco => case when campo = 'marco' then repeat('x', 201) else 'discord:otro-avatar' end,
       p_efecto => case when campo = 'efecto' then repeat('x', 201) else 'discord:otro-efecto' end,
       p_placa => case when campo = 'placa' then repeat('x', 201) else 'discord:otra-placa' end,
       p_marco_perfil => case when campo = 'marco_perfil' then repeat('x', 201) else 'discord:otra-tarjeta' end);
     raise exception 'Aceptó más de 200 caracteres en %', campo;
   exception when check_violation then null;
   end;
   select * into p from public.get_my_profile();
   if to_jsonb(p) is distinct from antes then raise exception 'El fallo de % guardó parcialmente', campo; end if;
 end loop;

 -- Se mantienen todas las validaciones previas al incorporar el nuevo campo.
 foreach consulta in array array[
   $q$select public.update_my_profile(p_username => '!', p_marco_perfil => 'no-guardar')$q$,
   $q$select public.update_my_profile(p_visibility => 'invalida', p_marco_perfil => 'no-guardar')$q$,
   $q$select public.update_my_profile(p_fuente => 'inexistente', p_marco_perfil => 'no-guardar')$q$,
   $q$select public.update_my_profile(p_bio => repeat('x', 181), p_marco_perfil => 'no-guardar')$q$,
   $q$select public.update_my_profile(p_avatar_encuadre => '{"x":0,"y":0,"escala":0}', p_marco_perfil => 'no-guardar')$q$,
   $q$select public.update_my_profile(p_banner_encuadre => '{"x":3,"y":0,"escala":1}', p_marco_perfil => 'no-guardar')$q$
 ] loop
   begin
     execute consulta;
     raise exception 'Se perdió una validación: %', consulta;
   exception when check_violation then null;
   end;
 end loop;
 begin
   perform public.update_my_profile(p_username => 'catalogo_visita', p_marco_perfil => 'no-guardar');
   raise exception 'Aceptó un nombre de usuario ocupado';
 exception when unique_violation then null;
 end;
 select * into p from public.get_my_profile();
 if to_jsonb(p) is distinct from antes then raise exception 'Una validación fallida dejó cambios'; end if;

 select * into p from public.update_my_profile(p_marco => limite, p_efecto => limite, p_placa => limite, p_marco_perfil => limite);
 if p.marco is distinct from limite or p.efecto is distinct from limite
    or p.placa is distinct from limite or p.marco_perfil is distinct from limite then
   raise exception 'No admite el límite de 200 caracteres en las cuatro piezas';
 end if;
 select * into p from public.update_my_profile(p_marco_perfil => 'x');
 if p.marco_perfil is distinct from 'x' then raise exception 'No admite el mínimo de un carácter'; end if;

 -- Los identificadores anteriores no necesitan migrarse ni pertenecer al catálogo Discord.
 select * into p from public.update_my_profile(p_marco => 'neon',
   p_efecto => 'imagen:00000000-0000-4000-8000-0000000000d1/efecto.webp',
   p_placa => 'placa-arcade', p_marco_perfil => 'tarjeta-local');
 if p.marco is distinct from 'neon'
    or p.efecto is distinct from 'imagen:00000000-0000-4000-8000-0000000000d1/efecto.webp'
    or p.placa is distinct from 'placa-arcade' or p.marco_perfil is distinct from 'tarjeta-local' then
   raise exception 'Se perdieron los nombres legacy o las imágenes propias';
 end if;
 antes := to_jsonb(p);
 select * into p from public.update_my_profile(p_marco_perfil => '');
 if p.marco_perfil is not null or (to_jsonb(p) - 'marco_perfil') is distinct from (antes - 'marco_perfil') then
   raise exception 'Quitar el marco exterior modificó otras piezas';
 end if;
 perform public.update_my_profile(p_marco_perfil => 'discord:423456789012345678');
 select * into p from public.update_my_profile(p_marco_perfil => '   ');
 if p.marco_perfil is not null then raise exception 'No normaliza espacios a null'; end if;
 select * into p from public.update_my_profile(p_marco => '', p_efecto => '', p_placa => '', p_marco_perfil => '');
 if p.marco is not null or p.efecto is not null or p.placa is not null or p.marco_perfil is not null then
   raise exception 'No permite quitar el paquete entero';
 end if;
 select * into p from public.update_my_profile(p_tema => '"BORRAR"', p_fuente => '',
   p_avatar_encuadre => '"BORRAR"', p_banner_encuadre => '"BORRAR"');
 if p.tema is not null or p.fuente is not null or p.avatar_encuadre is not null or p.banner_encuadre is not null then
   raise exception 'Cambió la semántica anterior de borrar tema, fuente o encuadres';
 end if;
 perform public.update_my_profile(p_marco => 'discord:1', p_efecto => 'discord:2',
   p_placa => 'discord:3:blue', p_marco_perfil => 'discord:4:dark');
end $$;

-- Otro usuario no ve el perfil privado y solo puede cambiar sus propios cosméticos.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
do $$ declare p record; begin
 if exists(select 1 from public.get_profile('catalogo_prueba'))
    or exists(select 1 from public.get_profile('no_existe')) then
   raise exception 'Expuso un perfil privado o inexistente';
 end if;
 select * into p from public.update_my_profile(p_marco_perfil => 'discord:visitante');
 if p.user_id is distinct from '00000000-0000-4000-8000-0000000000d2'::uuid then
   raise exception 'El visitante modificó otra cuenta';
 end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
do $$ declare p record; begin
 select * into p from public.update_my_profile(p_visibility => 'publico');
 if p.marco_perfil is distinct from 'discord:4:dark' then raise exception 'Otra cuenta cambió el marco'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
do $$ declare p record; begin
 select * into p from public.get_profile(' CATALOGO_PRUEBA ');
 if p.marco is distinct from 'discord:1' or p.efecto is distinct from 'discord:2'
    or p.placa is distinct from 'discord:3:blue' or p.marco_perfil is distinct from 'discord:4:dark' then
   raise exception 'El visitante no recibe el paquete del perfil público';
 end if;
 if to_jsonb(p) ? 'visibility' then raise exception 'La lectura pública expone la visibilidad'; end if;
end $$;

-- Aun con el rol authenticated, guardar requiere un usuario en la sesión.
select set_config('request.jwt.claims', '{}', true);
do $$ begin
 if exists(select 1 from public.get_my_profile()) then raise exception 'Devolvió un perfil sin usuario'; end if;
 begin
   perform public.update_my_profile(p_marco_perfil => 'discord:sin-sesion');
   raise exception 'Aceptó guardar sin sesión';
 exception when raise_exception then
   if sqlerrm <> 'Sesión requerida' then raise; end if;
 end;
end $$;
set local role anon;
do $$ begin
 begin
   perform public.get_my_profile();
   raise exception 'anon pudo consultar el perfil propio';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.get_profile('catalogo_prueba');
   raise exception 'anon pudo consultar perfiles públicos';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.update_my_profile(p_marco_perfil => 'discord:anon');
   raise exception 'anon pudo llamar al guardado';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
