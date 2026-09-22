/** Presentación de dnmusic. Nunca cambia IDs, parámetros ni el orden de recomendaciones. */
type Identidad = { nombre: string; detalle: string; tipo: 'genero' | 'momento'; motivo: number }
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'y').replace(/[^a-z0-9]+/g, ' ').trim()
const catalogo = new Map<string, Identidad>()
function agregar(nombre: string, detalle: string, aliases: string[], tipo: Identidad['tipo'] = 'genero') {
  const identidad = { nombre, detalle, tipo, motivo: catalogo.size % 3 }
  for (const alias of [nombre, ...aliases]) catalogo.set(normalizar(alias), identidad)
}

agregar('Pop', 'Melodías que se quedan', [])
agregar('Rock', 'Guitarras al frente', [])
agregar('Indie y alternativo', 'Sonidos fuera del molde', ['Indie & Alternative', 'Alternative & Indie'])
agregar('Hip-hop', 'Rimas y ritmo', ['Hip-Hop', 'Hip Hop'])
agregar('Hip-hop y rap', 'Rimas y ritmo', ['Hip-Hop & Rap', 'Hip Hop and Rap'])
agregar('R&B y soul', 'Voces con profundidad', ['R&B & Soul', 'R&B and Soul'])
agregar('Electrónica', 'Texturas y pulsos', ['Electronic', 'Dance & Electronic', 'Dance and Electronic', 'Dance & EDM'])
agregar('Reggaetón', 'El pulso de la noche', ['Reggaeton'])
agregar('Urbano latino', 'Ritmos de acá', ['Latin Urban', 'Urbano'])
agregar('Música latina', 'Muchas raíces, un ritmo', ['Latin', 'Latin Music', 'Latino'])
agregar('Pop latino', 'Melodías en español', ['Latin Pop'])
agregar('Rock en español', 'Guitarras con otra voz', ['Rock en Español', 'Latin Rock'])
agregar('Cumbia', 'Ritmo para compartir', [])
agregar('Cuarteto', 'Siempre para bailar', [])
agregar('Salsa', 'Clave y movimiento', [])
agregar('Bachata', 'Guitarras y encuentro', [])
agregar('Trap', 'Bajos y nuevas voces', [])
agregar('Música mexicana', 'Historias y raíces', ['Regional Mexican', 'Mexican Music', 'Regional Mexicano'])
agregar('Música argentina', 'Sonidos de casa', ['Argentinian Music', 'Argentine Music'])
agregar('Folk y acústico', 'Cuerdas de cerca', ['Folk & Acoustic', 'Folk and Acoustic'])
agregar('Folklore', 'Raíces que siguen vivas', ['Folklore latinoamericano'])
agregar('Jazz', 'Espacio para improvisar', [])
agregar('Blues', 'Cada nota cuenta', [])
agregar('Soul', 'Voces que llegan', [])
agregar('Metal', 'Intensidad sin pausa', [])
agregar('Punk', 'Energía sin vueltas', [])
agregar('Reggae', 'Otro pulso', [])
agregar('Clásica', 'Obras para descubrir', ['Classical', 'Classical Music'])
agregar('Bandas sonoras', 'Música que cuenta historias', ['Soundtracks', 'Film & TV', 'Soundtrack'])
agregar('K-pop', 'Voces, baile y producción', ['K-Pop'])
agregar('J-pop', 'Pop desde Japón', ['J-Pop'])
agregar('Country', 'Canciones e historias', [])
agregar('Música brasileña', 'Ritmos de Brasil', ['Brazilian', 'Brazilian Music', 'Brasil'])
agregar('Música del mundo', 'Más allá de lo conocido', ['World', 'World Music', 'Global'])
agregar('Cristiana y góspel', 'Voces de fe', ['Christian & Gospel', 'Christian and Gospel'])
agregar('Para relajarte', 'Bajá un cambio', ['Chill', 'Relax', 'Relaxation', 'Relajación'], 'momento')
agregar('Para concentrarte', 'Tu espacio, sin apuro', ['Focus', 'Concentración'], 'momento')
agregar('Para entrenar', 'Un poco más de energía', ['Workout', 'Fitness', 'Entrenamiento'], 'momento')
agregar('Para dormir', 'Sonidos para descansar', ['Sleep', 'Sueño'], 'momento')
agregar('De fiesta', 'La música nos encuentra', ['Party', 'Fiesta'], 'momento')
agregar('Para viajar', 'Que siga el camino', ['Commute', 'Travel', 'Viajes'], 'momento')
agregar('Romántica', 'Canciones para sentir', ['Romance', 'Love', 'Amor'], 'momento')
agregar('Buen ánimo', 'Un poco de luz', ['Feel Good', 'Happy', 'Feel-Good', 'Felicidad'], 'momento')
agregar('Energía', 'Subí el ritmo', ['Energy', 'Energize'], 'momento')

export const identidadGenero = (nombre: string): Identidad | null => catalogo.get(normalizar(nombre)) ?? null
export const nombreGenero = (nombre: string) => identidadGenero(nombre)?.nombre ?? nombre

/** Sólo categorías reconocidas: el proveedor no escribe la interfaz. Conserva cada ref opaca. */
export function catalogoGeneros<T extends { name: string; params: string }>(generos: T[], tipo?: Identidad['tipo']): T[] {
  const refs = new Set<string>()
  return generos.flatMap(g => {
    const identidad = identidadGenero(g.name)
    if (!identidad || (tipo && identidad.tipo !== tipo) || refs.has(g.params)) return []
    refs.add(g.params)
    return [{ ...g, name: identidad.nombre }]
  })
}

export function anchoTarjetaGenero(ancho: number): number {
  const disponible = Math.max(0, ancho - 48)
  const columnas = Math.max(1, Math.floor((disponible + 12) / 150))
  return Math.max(1, (disponible - (columnas - 1) * 12) / columnas)
}

/** Sólo títulos editoriales: no traduce nombres de artistas, canciones o discos. */
export function tituloEditorial(titulo: string): string {
  const conocido = identidadGenero(titulo)
  if (conocido) return conocido.nombre
  const clave = normalizar(titulo)
  if (/^(new releases|new albums|new albums (?:and|y) singles|latest releases|novedades|nuevos lanzamientos)$/.test(clave)) return 'Recién llegados'
  if (/^(trending|trending songs|tendencias|lo mas escuchado)$/.test(clave)) return 'Lo que está sonando'
  if (/^(charts|top charts|rankings|listas de exitos)$/.test(clave)) return 'Lo más escuchado'
  if (/^(recommended albums|albums for you|albumes recomendados)$/.test(clave)) return 'Discos para descubrir'
  if (/^(recommended playlists|playlists for you|featured playlists|listas recomendadas)$/.test(clave)) return 'Listas para descubrir'
  if (/^(music videos|new music videos|videos musicales)$/.test(clave)) return 'Nuevas canciones'
  if (/^(moods (?:and|y) genres|generos y momentos)$/.test(clave)) return 'Explorá tu música'
  // Copy del proveedor sin una equivalencia revisada no pasa a la portada.
  return 'Para descubrir'
}

export function tituloListaEditorial(titulo: string): string {
  const esenciales = /^(?:Presenting|This Is)\s+(.+)$/i.exec(titulo) ?? /^(.+?)\s+Essentials$/i.exec(titulo)
  if (esenciales) return `Lo esencial de ${nombreGenero(esenciales[1])}`
  const exitos = /^(.+?)\s+Hits$/i.exec(titulo)
  if (exitos) return `Éxitos de ${nombreGenero(exitos[1])}`
  return titulo // Un título propio no se traduce ni se inventa.
}

export function subtituloEditorial(subtitulo: string): string {
  return subtitulo.split(/\s*[•·]\s*/).map(parte => {
    if (/^YouTube Music$/i.test(parte)) return 'Selección musical'
    if (/^playlist$/i.test(parte)) return 'Lista'
    if (/^album$/i.test(parte)) return 'Álbum'
    if (/^single$/i.test(parte)) return 'Sencillo'
    return parte
  }).join(' · ')
}
