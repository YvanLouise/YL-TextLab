import { MAX_PITCH, MIN_PITCH, pitchHz, type Spectrum } from './types'
import { fft } from '../../utils/fft'
export { fft } from '../../utils/fft'

export function analyzeSpectrum(channels: Float32Array[], sampleRate: number, fftSize: number, onProgress: (percent: number) => void = () => {}): Spectrum {
  if (![2048, 4096, 8192].includes(fftSize) || !channels.length || channels.length > 2
    || !channels[0].length || !Number.isFinite(sampleRate) || sampleRate < 8000
    || channels.some(channel => channel.length !== channels[0].length)) throw new Error('频谱分析参数无效。')
  const length = channels[0].length
  const columns = Math.min(6000, Math.max(1, Math.ceil(length / 256)))
  const rows = (MAX_PITCH - MIN_PITCH + 1) * 4
  const values = new Uint8Array(columns * rows)
  const window = Float64Array.from({ length: fftSize }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (fftSize - 1)))
  const real = new Float64Array(fftSize), imaginary = new Float64Array(fftSize), power = new Float64Array(fftSize / 2)
  const bands = Array.from({ length: rows }, (_, row) => {
    const pitch = MAX_PITCH + .5 - (row + .5) / 4
    return { center: pitchHz(pitch) * fftSize / sampleRate,
      first: Math.ceil(pitchHz(pitch - .125) * fftSize / sampleRate), last: Math.floor(pitchHz(pitch + .125) * fftSize / sampleRate) }
  })
  let previous = -1
  for (let column = 0; column < columns; column++) {
    const center = Math.floor((column + .5) * length / columns)
    power.fill(0)
    for (const channel of channels) {
      imaginary.fill(0)
      for (let i = 0; i < fftSize; i++) real[i] = (channel[center - fftSize / 2 + i] ?? 0) * window[i]
      fft(real, imaginary)
      for (let i = 0; i < power.length; i++) power[i] += (real[i] ** 2 + imaginary[i] ** 2) / channels.length
    }
    for (let row = 0; row < rows; row++) {
      const band = bands[row]
      const low = Math.floor(band.center), fraction = band.center - low
      let energy = (power[low] ?? 0) * (1 - fraction) + (power[low + 1] ?? 0) * fraction
      for (let bin = band.first; bin <= Math.min(band.last, power.length - 1); bin++) energy = Math.max(energy, power[bin])
      const db = 10 * Math.log10(Math.max(1e-20, energy * 16 / fftSize ** 2))
      values[column * rows + row] = Math.round(Math.max(0, Math.min(1, (db + 90) / 90)) * 255)
    }
    const percent = Math.floor((column + 1) / columns * 100)
    if (percent !== previous) { previous = percent; onProgress(percent) }
  }
  return { values, columns, rows, duration: length / sampleRate, fftSize, sampleRate }
}
