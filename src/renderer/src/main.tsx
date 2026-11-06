import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import './glass.css'
import './native.css'
import { App } from './App'
import { initUnits } from './units'
import { isElectron, isMac } from './platform'
import { initAutoSave } from './autosave'

initUnits()
if (isMac && isElectron) document.documentElement.classList.add('vibrant')
initAutoSave()
import { CrashGuard } from './components/CrashGuard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </StrictMode>,
)
