/** FFT de 1024 muestras. Cuatro bandas del audio real, sin formas prefijadas. */
export function crearAnalizador() {
  const n = 1024
  const real = new Float64Array(n)
  const imag = new Float64Array(n)
  const ventana = Float64Array.from(
    { length: n },
    (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))),
  )
  return (canales: readonly { frames: readonly number[] }[]): number[] => {
    let frames = canales[0]?.frames
    let mayor = -1
    for (const canal of canales) {
      let energia = 0
      for (let i = Math.max(0, canal.frames.length - n); i < canal.frames.length; i++)
        energia += canal.frames[i] ** 2
      if (energia > mayor) {
        mayor = energia
        frames = canal.frames
      }
    }
    if (!frames?.length) return [0, 0, 0, 0]
    const offset = Math.max(0, frames.length - n)
    for (let i = 0; i < n; i++) {
      // Energía mono sin cancelar artificialmente canales en contrafase.
      real[i] = (frames[offset + i] ?? 0) * ventana[i]
      imag[i] = 0
    }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) {
        const t = real[i]
        real[i] = real[j]
        real[j] = t
      }
    }
    for (let largo = 2; largo <= n; largo <<= 1) {
      const angulo = (-2 * Math.PI) / largo
      const wr = Math.cos(angulo),
        wi = Math.sin(angulo)
      for (let inicio = 0; inicio < n; inicio += largo) {
        let xr = 1,
          xi = 0
        for (let j = 0; j < largo / 2; j++) {
          const a = inicio + j,
            b = a + largo / 2
          const vr = real[b] * xr - imag[b] * xi,
            vi = real[b] * xi + imag[b] * xr
          real[b] = real[a] - vr
          imag[b] = imag[a] - vi
          real[a] += vr
          imag[a] += vi
          const next = xr * wr - xi * wi
          xi = xr * wi + xi * wr
          xr = next
        }
      }
    }
    const limites = [1, 8, 32, 128, 512]
    return limites.slice(0, -1).map((desde, banda) => {
      let potencia = 0
      for (let i = desde; i < limites[banda + 1]; i++)
        potencia += (real[i] ** 2 + imag[i] ** 2) / (n * n)
      if (potencia < 1e-10) return 0
      const db = 10 * Math.log10(potencia)
      return Math.max(0, Math.min(1, (db + 65) / 60))
    })
  }
}
