import { describe, expect, it } from 'vitest'
import { searchTools, toolCategories, tools } from './tools'

describe('tool catalog', () => {
  it('keeps one unique route per live tool and groups every tool', () => {
    expect(tools).toHaveLength(9)
    expect(new Set(tools.map(tool => tool.path)).size).toBe(tools.length)
    expect(new Set(tools.map(tool => tool.id)).size).toBe(tools.length)
    expect(toolCategories.map(category => tools.filter(tool => tool.category === category.id).length)).toEqual([3, 1, 5])
    expect(tools.every(tool => toolCategories.some(category => category.id === tool.category))).toBe(true)
    expect(searchTools('敬请期待')).toEqual([])
  })

  it('searches names, categories, formats and use cases case-insensitively', () => {
    expect(searchTools('   ')).toEqual(tools)
    expect(searchTools('mIdI').map(tool => tool.id)).toEqual(['audioMidi'])
    expect(searchTools('无损').map(tool => tool.id)).toEqual(['image', 'audio'])
    expect(searchTools('音频 无损').map(tool => tool.id)).toEqual(['audio'])
    expect(searchTools('歌曲信息')[0].path).toBe('/audio-convert')
    expect(searchTools('图片处理')[0].path).toBe('/image-convert')
    expect(searchTools('not-a-tool')).toEqual([])
  })
})
