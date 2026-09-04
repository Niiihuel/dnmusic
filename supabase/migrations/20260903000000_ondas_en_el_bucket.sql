/*
 * Que el bucket acepte las ondas que ya intentaba guardar.
 *
 * `/peaks` calcula la forma de onda de una canción —ffmpeg baja el tema entero
 * y lo decodifica a PCM, que es lo más caro que hace el servicio— y desde el
 * día uno la archiva al lado del audio, en `picos/…json`, para no volver a
 * hacerlo nunca más. Nunca se guardó ni una: el bucket nació aceptando tres
 * tipos de audio, y `application/json` no es ninguno de los tres. La subida
 * rebotaba con «mime type application/json is not supported», el error se
 * tragaba a propósito —archivar es una mejora, no parte de la respuesta— y
 * así cada pedido de una onda volvía a decodificar la canción entera.
 *
 * No se notó porque funciona igual: la onda sale bien, solo que se paga entera
 * todas las veces. En un contenedor con el CPU ya alquilado eso es lento; en
 * una función que se cobra por tiempo de CPU es lento *y* caro, y por eso
 * aparece ahora, mudándonos.
 *
 * Va en el bucket y no en la app porque es quien puede negarse de verdad —el
 * mismo criterio que las vitrinas—, y el tope de tamaño se queda como está: una
 * onda son un puñado de números, del orden de un kilobyte.
 */
update storage.buckets
set allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/mpeg', 'application/json']
where id = 'songs';
