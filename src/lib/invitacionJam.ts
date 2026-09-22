/** Reconoce enlaces propios; nunca convierte enlaces de terceros en invitaciones. */
export function invitacionEnTexto(texto: string): { codigo: string; texto: string } | null {
  // El host retirado sólo se admite al leer mensajes históricos, nunca se genera.
  const enlace = /https:\/\/(?:dnmusic-production-c3f4\.up\.railway\.app|dnmusic-app\.vercel\.app)\/jam\/([a-z0-9]{4,10})(?=$|[\s/?#.,!])/i.exec(
    texto,
  )
  if (!enlace) return null
  const resto = texto
    .replace(enlace[0], '')
    .replace(/^Escuchemos juntos en dnmusic\s*(?:🎧|:)?\s*/i, '')
    .trim()
  return { codigo: enlace[1].toUpperCase(), texto: resto }
}
