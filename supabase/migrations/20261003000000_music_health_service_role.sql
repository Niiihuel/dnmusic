-- /health comprueba PostgREST y Postgres con la clave del servicio.
-- La tabla pairs solo concedía SELECT a authenticated, por lo que el servicio
-- respondía 503 aunque la base estuviera disponible.
grant select on public.pairs to service_role;
notify pgrst, 'reload schema';
