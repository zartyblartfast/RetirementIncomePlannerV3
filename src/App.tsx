import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import WhatIf from './pages/WhatIf'
import Review from './pages/Review'
import Optimise from './pages/Optimise'

function App() {
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
