import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import WhatIf from './pages/WhatIf'
import Review from './pages/Review'
import Optimise from './pages/Optimise'
import WelcomeScreen from './pages/WelcomeScreen'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import { useConfig, importConfigFromFile } from './store/configStore'

function App() {
  const { isFirstVisit, setConfig, markConfigured } = useConfig()
  const [showWizard, setShowWizard] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  function handleLoadFile() {
    setImportError(null)
    importConfigFromFile()
      .then(cfg => {
        setConfig(cfg)
        markConfigured()
      })
      .catch(err => { setImportError((err as Error).message) })
  }

  if (isFirstVisit) {
    return (
      <>
        <WelcomeScreen
          onLoadFile={handleLoadFile}
          onStartWizard={() => setShowWizard(true)}
          importError={importError}
        />
        {showWizard && (
          <OnboardingWizard onDone={() => setShowWizard(false)} />
        )}
      </>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="what-if" element={<WhatIf />} />
        <Route path="optimise" element={<Optimise />} />
        <Route path="review" element={<Review />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
