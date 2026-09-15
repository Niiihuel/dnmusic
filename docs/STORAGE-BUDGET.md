# Presupuesto de Storage en el plan Free

Supabase puede restringir servicios del proyecto cuando Storage supera la
cuota. Como Auth comparte esa restricción, un caché lleno puede terminar
bloqueando el ingreso con Google aunque OAuth esté bien configurado.

La aplicación usa dos límites preventivos:

- El servidor limpia al superar 800 MiB y no permite proyectar más de 850 MiB.
- Las cargas directas de avatar, portada y vitrina se frenan en 875 MiB.

La diferencia deja una reserva para pequeñas carreras entre peticiones y para
la medición de Supabase. Los valores del servidor se pueden bajar con
`STORAGE_TARGET_MB` y `STORAGE_HARD_LIMIT_MB`; no conviene subirlos en Hobby.

## Qué se puede limpiar

Solo se eliminan cachés con más de seis horas que no estén referenciados por
listas, Me gusta, Jam, mensajes, escuchas o vitrinas:

- audios resueltos que ya no usa ningún registro;
- carátulas copiadas que ya no usa ningún registro;
- formas de onda y archivos de cuarentena abandonados.

Nunca se eliminan automáticamente avatares, fondos/GIF, decoraciones, portadas,
canciones propias, audio referenciado ni carátulas extraídas de archivos
propios. Si ya no queda caché descartable, se rechaza solamente la nueva subida
y Auth conserva su reserva.

## Auditoría y limpieza manual

Desde `server/`, con `.env.local` configurado:

```sh
npm run storage:audit
npm run storage:cleanup
```

El primer comando solo calcula; el segundo borra mediante la API oficial de
Storage. No se deben borrar filas directamente de `storage.objects`, porque eso
deja archivos físicos huérfanos y no reduce correctamente el uso.

La migración `20260925000000_storage_budget.sql` debe desplegarse antes que el
cliente que llama `storage_upload_allowed`. Después de recuperar un proyecto
ya restringido, ejecutar una limpieza una vez y desplegar servidor, migración y
cliente deja la protección permanente activa.
