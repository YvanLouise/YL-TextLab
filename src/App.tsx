import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RouteBoundary } from './components/RouteBoundary'
import { HomePage } from './pages/HomePage'

const ChangelogPage = lazy(() => import('./pages/ChangelogPage').then((module) => ({ default: module.ChangelogPage })))
const FeaturesPage = lazy(() => import('./pages/FeaturesPage').then((module) => ({ default: module.FeaturesPage })))
const HelpPage = lazy(() => import('./pages/HelpPage').then((module) => ({ default: module.HelpPage })))
const NotionSplitPage = lazy(() => import('./pages/NotionSplitPage').then((module) => ({ default: module.NotionSplitPage })))
const PdfViewerPage = lazy(() => import('./pages/PdfViewerPage').then((module) => ({ default: module.PdfViewerPage })))
const ReplacePage = lazy(() => import('./pages/ReplacePage').then((module) => ({ default: module.ReplacePage })))

const ImageConvertPage = lazy(() =>
  import('./pages/ImageConvertPage').then((module) => ({ default: module.ImageConvertPage })),
)

const AudioConvertPage = lazy(() =>
  import('./pages/AudioConvertPage').then((module) => ({ default: module.AudioConvertPage })),
)

const AudioSplitPage = lazy(() =>
  import('./pages/AudioSplitPage').then((module) => ({ default: module.AudioSplitPage })),
)

const AudioSubtractPage = lazy(() =>
  import('./pages/AudioSubtractPage').then((module) => ({ default: module.AudioSubtractPage })),
)

const AudioMidiPage = lazy(() => import('./pages/AudioMidiPage').then(module => ({ default: module.AudioMidiPage })))
const AudioVocalPage = lazy(() => import('./pages/AudioVocalPage').then(module => ({ default: module.AudioVocalPage })))

const titles: Record<string, string> = {
  '/features': '全部功能', '/replace': '关键词替换', '/notion-split': 'Notion 文本切分',
  '/pdf': 'PDF 查看', '/image-convert': '图片转换与压缩', '/audio-convert': '音频格式转换',
  '/audio-split': '音频分割与提取', '/audio-subtract': '音频相减', '/audio-midi': '音频频谱画 MIDI', '/audio-vocal': '主唱净化', '/help': '使用帮助', '/changelog': '更新日志',
}

function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    document.title = titles[location.pathname] ? `${titles[location.pathname]} · YL文件工具箱` : 'YL文件工具箱'
    const frame = requestAnimationFrame(() => {
      let id = location.hash.slice(1)
      try { id = decodeURIComponent(id) } catch { /* Treat malformed URL fragments as literal IDs. */ }
      const anchor = id ? document.getElementById(id) : null
      if (anchor) anchor.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      else window.scrollTo({ top: 0, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.hash])

  return null
}

export default function App() {
  const location = useLocation()
  return (
    <RouteBoundary key={location.pathname}>
      <Suspense fallback={<main className="page-shell route-status" role="status"><h1>正在打开工具…</h1><p>请稍候，页面即将就绪。</p></main>}>
      <RouteEffects />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/replace" element={<ReplacePage />} />
        <Route path="/notion-split" element={<NotionSplitPage />} />
        <Route path="/pdf" element={<PdfViewerPage />} />
        <Route
          path="/image-convert"
          element={<ImageConvertPage />}
        />
        <Route
          path="/audio-convert"
          element={<AudioConvertPage />}
        />
        <Route
          path="/audio-split"
          element={<AudioSplitPage />}
        />
        <Route path="/audio-subtract" element={<AudioSubtractPage />} />
        <Route path="/audio-midi" element={<AudioMidiPage />} />
        <Route path="/audio-vocal" element={<AudioVocalPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
      </Suspense>
    </RouteBoundary>
  )
}
