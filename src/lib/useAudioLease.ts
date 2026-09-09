import { useLayoutEffect, useMemo } from 'react'

class AudioLease {
  private vigente = true
  constructor(readonly player: object) {}
  get active() { return this.vigente }
  activar() { this.vigente = true }
  invalidar() { this.vigente = false }
}

/** Invalida callbacks antes de que expo-audio libere su objeto nativo. */
export function useAudioLease(player: object) {
  const lease = useMemo(() => new AudioLease(player), [player])
  useLayoutEffect(() => {
    lease.activar()
    return () => lease.invalidar()
  }, [lease])
  return lease
}
