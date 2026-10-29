// Iterative radix-2 FFT; callers may reuse the same buffers between frames.
export function fft(real: Float64Array, imaginary: Float64Array) {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]] }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -2 * Math.PI / size
    const wr = Math.cos(angle), wi = Math.sin(angle)
    for (let base = 0; base < n; base += size) {
      let ur = 1, ui = 0
      for (let k = 0; k < size / 2; k++) {
        const a = base + k, b = a + size / 2
        const tr = ur * real[b] - ui * imaginary[b], ti = ur * imaginary[b] + ui * real[b]
        real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti
        real[a] += tr; imaginary[a] += ti
        const next = ur * wr - ui * wi
        ui = ur * wi + ui * wr; ur = next
      }
    }
  }
}
