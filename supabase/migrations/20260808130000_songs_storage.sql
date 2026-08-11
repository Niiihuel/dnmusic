-- ═══════════════════════════════════════════════════════════════════════════
-- Almacenamiento de canciones.
--
-- El servicio de música resuelve y descarga el audio UNA vez por canción y lo
-- deja acá. La app lo reproduce desde Storage, no desde la fuente original: es
-- más rápido, evita depender de terceros en cada reproducción, y las canciones
-- ya enviadas siguen sonando aunque la resolución se rompa más adelante.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'songs', 'songs',
  false,                    -- privado: se sirve con URLs firmadas
  25 * 1024 * 1024,         -- 25 MB alcanza de sobra para un tema en opus
  array['audio/webm', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura: cualquiera de los dos, mientras esté logueado.
--
-- No se restringe por par: el contenido del bucket son canciones, no mensajes.
-- Lo privado (el texto, quién lo mandó, cuándo se abrió) vive en public.messages
-- con su propio RLS. Atar cada archivo a un par obligaría a duplicarlo cuando
-- los dos mandan el mismo tema, sin proteger nada que ya no esté protegido.
drop policy if exists "miembros leen canciones" on storage.objects;
create policy "miembros leen canciones" on storage.objects
  for select to authenticated
  using (bucket_id = 'songs');

-- Escritura: solo el servicio, que usa la service_role key y saltea RLS.
-- Sin policy de insert/update/delete para `authenticated`, así el cliente no
-- puede subir nada aunque quisiera.
