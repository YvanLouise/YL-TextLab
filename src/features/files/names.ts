export function uniqueFileNames(names: string[]) {
  const key = (name: string) => name.normalize('NFC').toLowerCase()
  const reserved = new Set(names.map(key))
  const used = new Set<string>()
  return names.map((name) => {
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const extension = dot > 0 ? name.slice(dot) : ''
    let candidate = name
    let sequence = 2
    while (used.has(key(candidate))) {
      do { candidate = `${base}-${sequence++}${extension}` } while (reserved.has(key(candidate)))
    }
    used.add(key(candidate))
    return candidate
  })
}
