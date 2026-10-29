// Use Unicode as the CID instead of PDFium's glyph-to-Unicode reversal, which
// can otherwise turn Chinese characters into visually identical radical codes.
export function cidMap(font: Uint8Array): Uint8Array {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  let cmap = 0
  for (let i = 0; i < view.getUint16(4); i++) {
    const offset = 12 + i * 16
    if (view.getUint32(offset) === 0x636d6170) cmap = view.getUint32(offset + 8)
  }
  if (!cmap) throw new Error('编辑字体缺少 Unicode 字符映射。')
  let table = 0, format = 0
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const record = cmap + 4 + i * 8
    const platform = view.getUint16(record), encoding = view.getUint16(record + 2)
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue
    const candidate = cmap + view.getUint32(record + 4), type = view.getUint16(candidate)
    if (type === 12 || (type === 4 && format !== 12)) { table = candidate; format = type }
  }
  const result = new Uint8Array(65536 * 2), map = new DataView(result.buffer)
  if (format === 12) {
    for (let i = 0; i < view.getUint32(table + 12); i++) {
      const at = table + 16 + i * 12, first = view.getUint32(at), last = Math.min(65535, view.getUint32(at + 4)), glyph = view.getUint32(at + 8)
      for (let char = first; char <= last; char++) map.setUint16(char * 2, glyph + char - first)
    }
  } else if (format === 4) {
    const segments = view.getUint16(table + 6) / 2
    for (let i = 0; i < segments; i++) {
      const last = view.getUint16(table + 14 + i * 2), first = view.getUint16(table + 16 + segments * 2 + i * 2)
      const delta = view.getInt16(table + 16 + segments * 4 + i * 2), rangeAt = table + 16 + segments * 6 + i * 2, range = view.getUint16(rangeAt)
      for (let char = first; char <= last; char++) {
        const glyph = range ? view.getUint16(rangeAt + range + (char - first) * 2) : char
        map.setUint16(char * 2, glyph || !range ? (glyph + delta) & 65535 : 0)
      }
    }
  } else throw new Error('编辑字体的 Unicode 映射格式不受支持。')
  return result
}

export function unicodeCmap(text: string): string {
  const codes = Array.from(new Set(Array.from(text).map((char) => char.charCodeAt(0))))
  const blocks: string[] = []
  for (let i = 0; i < codes.length; i += 100) {
    const group = codes.slice(i, i + 100)
    blocks.push(`${group.length} beginbfchar\n${group.map((code) => { const hex = code.toString(16).padStart(4, '0'); return `<${hex}> <${hex}>` }).join('\n')}\nendbfchar`)
  }
  return `/CIDInit /ProcSet findresource begin
12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def
/CMapName /YLUnicode def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${blocks.join('\n')}
endcmap CMapName currentdict /CMap defineresource pop end end`
}
