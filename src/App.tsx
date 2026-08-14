import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ChangelogPage } from './pages/ChangelogPage'
import { FeaturesPage } from './pages/FeaturesPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { NotionSplitPage } from './pages/NotionSplitPage'
import { PdfViewerPage } from './pages/PdfViewerPage'
import { ReplacePage } from './pages/ReplacePage'

const ImageConvertPage = lazy(() =>
  import('./pages/ImageConvertPage').then((module) => ({ default: module.ImageConvertPage })),
)

const AudioConvertPage = lazy(() =>
  import('./pages/AudioConvertPage').then((module) => ({ default: module.AudioConvertPage })),
)

const AudioSplitPage = lazy(() =>
  import('./pages/AudioSplitPage').then((module) => ({ default: module.AudioSplitPage })),
)

function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      requestAnimationFrame(() =>
        document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }),
      )
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [location.pathname, location.hash])

  return null
}

export default function App() {
  return (
    <>
      <RouteEffects />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/replace" element={<ReplacePage />} />
        <Route path="/notion-split" element={<NotionSplitPage />} />
        <Route path="/pdf" element={<PdfViewerPage />} />
        <Route
          path="/image-convert"
          element={<Suspense fallback={<div className="page-shell">正在打开图片转换工具…</div>}><ImageConvertPage /></Suspense>}
        />
        <Route
          path="/audio-convert"
          element={<Suspense fallback={<div className="page-shell">正在打开音频转换工具…</div>}><AudioConvertPage /></Suspense>}
        />
        <Route
          path="/audio-split"
          element={<Suspense fallback={<div className="page-shell">正在打开音频分割工具…</div>}><AudioSplitPage /></Suspense>}
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </>
  )
}
