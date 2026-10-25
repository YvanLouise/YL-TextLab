import { describe, expect, it } from 'vitest'
import { uniqueFileNames } from './names'

describe('export file names', () => {
  it('reserves numbered originals and compares names safely for Windows extraction', () => {
    expect(uniqueFileNames(['Song.mp3', 'song.MP3', 'song-2.MP3', 'song.mp3']))
      .toEqual(['Song.mp3', 'song-3.MP3', 'song-2.MP3', 'song-4.mp3'])
  })

  it('handles extensionless names and canonically equivalent Unicode', () => {
    expect(uniqueFileNames(['file', 'file', 'file-2', 'é.wav', 'e\u0301.wav']))
      .toEqual(['file', 'file-3', 'file-2', 'é.wav', 'e\u0301-2.wav'])
  })
})
