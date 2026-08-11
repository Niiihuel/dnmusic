/*
 * Fotos animadas y clips en el perfil.
 *
 * Los buckets nacieron aceptando solo JPEG, PNG y WebP con dos megas de tope, y
 * eso era lo correcto cuando lo único que se subía era una foto de perfil
 * cuadrada. Con las vitrinas —que son la parte del perfil que uno *muestra*—
 * queda corto: un GIF de cuatro segundos pesa más que eso y es justamente lo que
 * la gente cuelga en Steam.
 *
 * La lista de tipos vive **en el bucket** y no solo en la app a propósito: es
 * quien puede negarse de verdad. La app puede tener un bug o quedar vieja; la
 * base no. Por eso los rechazos se veían como «mime type … is not supported» y
 * no como un error nuestro.
 */

/* Ocho megas y GIF: una foto de perfil animada es un GIF corto, no un video. */
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';

/*
 * Las vitrinas aceptan además video.
 *
 * Veinticinco megas es el mismo tope que ya tienen las canciones: alcanza para
 * un clip corto en buena calidad y no para que alguien suba una película. El
 * `.mov` entra porque es lo que graba el iPhone — pedirle a alguien que convierta
 * su propio video antes de subirlo es pedirle que no lo suba.
 */
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime'
    ]
where id = 'showcases';
