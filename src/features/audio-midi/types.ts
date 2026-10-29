export const MIN_PITCH = 21
export const MAX_PITCH = 108
export const MAX_NOTES = 2000
export const ANALYSIS_RATE = 22050
export const MAX_AUDIO_SECONDS = 600
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024

export interface MidiNote { id: string; pitch: number; start: number; end: number; velocity: number }
export interface Spectrum { values: Uint8Array; columns: number; rows: number; duration: number; fftSize: number; sampleRate: number }
export interface MidiSource { name: string; buffer: AudioBuffer; spectrum: Spectrum }
export type SpectrumAnalyzer = (file: File, fftSize: number, signal: AbortSignal, onProgress: (percent: number) => void) => Promise<MidiSource>
export interface MidiProject { version: 1; sourceName: string; duration: number; bpm: number; notes: MidiNote[] }
export type EditTool = 'draw' | 'select' | 'pan' | 'erase'

export const pitchName = (pitch: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`
export const pitchHz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)
