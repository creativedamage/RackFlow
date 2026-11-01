import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { initUnits } from './units'
import { initAutoSave } from './autosave'

initUnits()
initAutoSave()
import { CrashGuard } from './components/CrashGuard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </StrictMode>,
)
