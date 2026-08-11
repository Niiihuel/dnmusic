/*
 * La vitrina de ilustración.
 *
 * Es la pieza grande del centro en los perfiles de Steam: una imagen vertical
 * que quien arma el perfil sube. Se agrega al `check` de tipos para que la base
 * la acepte — hasta ahora rechazaba cualquier valor fuera de los cuatro que
 * había.
 */
alter table public.profile_showcases drop constraint if exists profile_showcases_kind_check;
alter table public.profile_showcases
  add constraint profile_showcases_kind_check
  check (kind in ('cancion', 'fragmento', 'lista', 'texto', 'ilustracion'));

/*
 * Dónde viven esas imágenes.
 *
 * Bucket propio y no `avatars`: son cosas distintas —una foto de perfil es
 * chica y cuadrada, una ilustración es grande y vertical— y mezclarlas obligaría
 * a que las reglas de tamaño sirvieran para las dos, o sea a no tener ninguna.
 *
 * Público, como las carátulas y las portadas: se leen desde el perfil de
 * cualquiera que se deje ver, y firmar cada una sería pedir una firma por
 * imagen cada vez que alguien mira un perfil.
 */
insert into storage.buckets (id, name, public)
values ('showcases', 'showcases', true)
on conflict (id) do update set public = true;

drop policy if exists "las ilustraciones son públicas" on storage.objects;
create policy "las ilustraciones son públicas"
  on storage.objects for select to public
  using (bucket_id = 'showcases');

/*
 * Cada cuenta escribe **dentro de su carpeta**, que es su id.
 *
 * Sin el prefijo cualquiera con sesión podría pisar la ilustración de otro: el
 * bucket es uno solo y las rutas las elige quien sube.
 */
drop policy if exists "cada cuenta sube sus ilustraciones" on storage.objects;
create policy "cada cuenta sube sus ilustraciones"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'showcases' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cada cuenta reemplaza sus ilustraciones" on storage.objects;
create policy "cada cuenta reemplaza sus ilustraciones"
  on storage.objects for update to authenticated
  using (bucket_id = 'showcases' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cada cuenta borra sus ilustraciones" on storage.objects;
create policy "cada cuenta borra sus ilustraciones"
  on storage.objects for delete to authenticated
  using (bucket_id = 'showcases' and (storage.foldername(name))[1] = auth.uid()::text);
