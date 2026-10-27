import { describe, expect, it, vi } from 'vitest'
import { buildAudioExportEntries, collectAudioDrop, selectAudioImports } from './batch'
import { MAX_AUDIO_BATCH_SIZE, MAX_AUDIO_FILE_SIZE, MAX_AUDIO_FILES, type AudioConversionResult } from './types'

const file = (name: string, size = 16) => Object.defineProperty(new File(['audio'], name), 'size', { value: size })
const entry = (name: string, size?: number, relativePath?: string) => ({ file: file(name, size), relativePath })

describe('audio batch import and export', () => {
  it('filters folders, rejects unsafe paths and preserves duplicate tracks from different subdirectories', () => {
    const inputs = [entry('song.WAV', 16, 'Album/A/song.WAV'), entry('song.WAV', 16, 'Album/B/song.WAV'),
      entry('voice.aifc'), entry('note.txt'), entry('lossy.mp3'), entry('bad.wav', 16, '../bad.wav')]
    const selection = selectAudioImports(inputs, [], true)
    expect(selection.selected).toEqual(inputs.slice(0, 3))
    expect(selection).toMatchObject({ unsupported: 2, invalid: 1, limited: 0 })
    expect(selectAudioImports([entry('lossy.mp3')], [], false).selected).toHaveLength(1)
  })

  it('enforces per-file, batch-byte and file-count boundaries while accepting later files that fit', () => {
    expect(selectAudioImports([entry('at.wav', MAX_AUDIO_FILE_SIZE), entry('over.wav', MAX_AUDIO_FILE_SIZE + 1), entry('empty.wav', 0)], [], true))
      .toMatchObject({ selected: [entry('at.wav', MAX_AUDIO_FILE_SIZE)], limited: 2 })
    const current = Array.from({ length: 4 }, (_, i) => file(`${i}.wav`, MAX_AUDIO_FILE_SIZE))
    const remaining = MAX_AUDIO_BATCH_SIZE - 4 * MAX_AUDIO_FILE_SIZE
    const full = selectAudioImports([entry('over.wav', remaining + 1), entry('fits.wav', remaining), entry('extra.wav', 1)], current, true)
    expect(full.selected.map(value => value.file.name)).toEqual(['fits.wav'])
    expect(full.limited).toBe(2)
    const almostFull = Array.from({ length: MAX_AUDIO_FILES - 1 }, () => file('track.wav'))
    expect(selectAudioImports([entry('too-big.wav', MAX_AUDIO_FILE_SIZE + 1), entry('last.wav'), entry('extra.wav')], almostFull, true))
      .toMatchObject({ selected: [entry('last.wav')], limited: 2 })
  })

  it('keeps every result without overwriting numbered files or directory names', () => {
    const result = (fileName: string): AudioConversionResult => ({ blob: new Blob([fileName]), fileName, format: 'flac', durationMs: 1, warnings: [] })
    const outputs = buildAudioExportEntries([
      { relativePath: 'Album/A/one.wav', result: result('song.flac') },
      { relativePath: 'Album/A/two.wav', result: result('song.flac') },
      { relativePath: 'Album/A/three.wav', result: result('song-2.flac') },
      { relativePath: 'Album/B/song.wav', result: result('song.flac') },
      { relativePath: 'song.flac/sub.wav', result: result('sub.flac') },
      { result: result('song.flac') },
    ])
    expect(outputs.map(value => value.path)).toEqual([
      'Album/A/song.flac', 'Album/A/song-3.flac', 'Album/A/song-2.flac', 'Album/B/song.flac', 'song.flac/sub.flac', 'song-2.flac',
    ])
    expect(() => buildAudioExportEntries([{ relativePath: '../escape.wav', result: result('escape.flac') }])).toThrow('Invalid relative path')
  })
})

function nativeFile(name: string, fail = false): FileSystemEntry {
  return { name, isFile: true, isDirectory: false,
    file: (accept: (value: File) => void, reject: (error: DOMException) => void) => fail ? reject(new DOMException('Unreadable')) : accept(file(name)),
  } as unknown as FileSystemEntry
}

function directory(name: string, pages: FileSystemEntry[][]): FileSystemEntry {
  return { name, isFile: false, isDirectory: true, createReader: () => ({
    readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(pages.shift() ?? []),
  }) } as unknown as FileSystemEntry
}

function transfer(entries: FileSystemEntry[]) {
  return { items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry, getAsFile: () => null })), files: [] } as unknown as DataTransfer
}

describe('audio directory drop', () => {
  it('reads all directory pages and nested paths, continuing past unreadable files', async () => {
    const data = transfer([directory('Album', [[nativeFile('one.wav'), nativeFile('bad.wav', true)],
      [directory('Side B', [[nativeFile('two.flac')]])]])])
    const selection = await collectAudioDrop(data, new AbortController().signal)
    expect(selection).toMatchObject({ folder: true, unreadable: 1, truncated: false })
    expect(selection.files.map(value => value.relativePath)).toEqual(['Album/one.wav', 'Album/Side B/two.flac'])
  })

  it('captures drop entries synchronously and ignores late directory results after cancellation', async () => {
    const controller = new AbortController()
    let finish: (files: FileSystemEntry[]) => void = () => {}
    const root = { name: 'Album', isDirectory: true, createReader: () => ({ readEntries: (resolve: typeof finish) => { finish = resolve } }) }
    const data = transfer([root as unknown as FileSystemEntry])
    const get = vi.spyOn(data.items[0], 'webkitGetAsEntry')
    const pending = collectAudioDrop(data, controller.signal)
    expect(get).toHaveBeenCalledOnce()
    controller.abort()
    finish([nativeFile('late.wav')])
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('falls back to regular file drops when directory APIs are absent', async () => {
    const audio = file('song.wav')
    const data = { files: [audio] } as unknown as DataTransfer
    expect((await collectAudioDrop(data, new AbortController().signal)).files).toEqual([{ file: audio, relativePath: undefined }])
  })
})
