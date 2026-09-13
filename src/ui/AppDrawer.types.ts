export type AppDrawerProps = {
  name: string
  avatarPath: string | null | undefined
  onProfile: () => void
  onPlaylists: () => void
  onChats: () => void
  onNowPlaying: () => void
  onNewPlaylist: () => void
  /** Abre una lista puntual, sin pasar por la pestaña. */
  onOpenPlaylist: (id: string) => void
  onAjustes: () => void
}
