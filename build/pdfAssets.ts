import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// PDF.js auxiliary data is served from this site, never a third-party CDN.
export function pdfAssets(): Plugin {
  const root = new URL('../node_modules/pdfjs-dist/', import.meta.url)
  let assets: Map<string, Buffer> | undefined
  let base = '/'
  const load = async () => {
    if (assets) return assets
    const entries: [string, Buffer][] = []
    for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
      for (const file of await readdir(new URL(`${directory}/`, root))) {
        entries.push([`pdf-assets/${directory}/${file}`, await readFile(new URL(`${directory}/${file}`, root))])
      }
    }
    entries.push(['pdf-assets/LICENSE', await readFile(new URL('LICENSE', root))])
    for (const name of ['LICENSE', 'LICENSE.pdfium']) entries.push([`pdf-editor/${name}`, await readFile(new URL(`../@embedpdf/pdfium/${name}`, root))])
    assets = new Map(entries)
    return assets
  }
  return {
    name: 'local-pdf-assets',
    configResolved(config) { base = config.base },
    async configureServer(server) {
      const files = await load()
      server.middlewares.use((request, response, next) => {
        const requestPath = (request.url ?? '').split('?')[0]
        const path = (requestPath.startsWith(base) ? requestPath.slice(base.length) : requestPath).replace(/^\//, '')
        const file = files.get(path)
        if (!file) return next()
        response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        response.setHeader('Cache-Control', 'public, max-age=3600')
        response.end(file)
      })
    },
    async generateBundle() {
      for (const [fileName, source] of await load()) this.emitFile({ type: 'asset', fileName, source })
    },
    watchChange(id) {
      if (id.startsWith(fileURLToPath(root))) assets = undefined
    },
  }
}
