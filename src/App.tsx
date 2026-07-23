import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ChangelogPage } from './pages/ChangelogPage'
import { FeaturesPage } from './pages/FeaturesPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { ReplacePage } from './pages/ReplacePage'

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
        <Route path="/help" element={<HelpPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </>
  )
}
