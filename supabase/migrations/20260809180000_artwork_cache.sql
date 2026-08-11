-- ═══════════════════════════════════════════════════════════════════════════
-- Carátulas y fotos de artista guardadas por nosotros.
--
-- Hasta acá las imágenes se pedían directo al CDN de Google en cada render.
-- Medido: con el user-agent de un navegador responde **HTTP 429 con
-- text/html**, y como manda `x-content-type-options: nosniff`, Chrome bloquea
-- la respuesta (ERR_BLOCKED_BY_ORB) en vez de mostrar algo. El resultado son
-- carátulas vacías, de forma intermitente y sin aviso.
--
-- Con el disco de vinilo como presentación de un mensaje, esa imagen pasó de
-- ser una miniatura de 44 px a ser el centro de la pantalla: un hueco ahí no es
-- un detalle. Así que se copian una sola vez a Storage, igual que ya se hace
-- con el audio, y la app las lee desde ahí.
-- ═══════════════════════════════════════════════════════════════════════════

/*
 * Bucket público, como `avatars` y a diferencia de `songs`.
 *
 * Una carátula aparece en cada burbuja, en cada fila de la lista y en el disco;
 * firmar una URL por cada una —y volver a firmarlas al vencer— no se justifica.
 * Además son imágenes que ya son públicas en internet: no hay nada que
 * proteger. Escribir sigue siendo exclusivo del servicio (service_role).
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork', 'artwork', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "las carátulas son públicas" on storage.objects;
create policy "las carátulas son públicas"
  on storage.objects for select
  using (bucket_id = 'artwork');
