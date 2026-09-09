-- Catálogo compartido por el perfil propio, público y las piezas del mosaico.
-- Conserva todos los IDs anteriores; sólo amplía las opciones admitidas.
alter table public.profiles drop constraint if exists profiles_fuente_check;
alter table public.profiles add constraint profiles_fuente_check
  check (fuente is null or fuente in (
    'revista','redonda','maquina','manuscrita','cartel','retro',
    'editorial','geometrica','urbana','caligrafica','suave','clasica'
  ));
