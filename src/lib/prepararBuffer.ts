import { clearPreloadedSource, preload } from 'expo-audio'

export async function prepararBuffer(uri: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' })
  await preload({ uri })
  if (signal.aborted) {
    await clearPreloadedSource({ uri })
    throw Object.assign(new Error('Cancelado'), { name: 'AbortError' })
  }
  return uri
}
export function liberarBuffer(uri: string) { void clearPreloadedSource({ uri }) }
