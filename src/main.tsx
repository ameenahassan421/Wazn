import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { captureInviteFromUrl } from './lib/invite'

// Before React renders. An invite link is `/join/<code>`; the code is stashed
// and the URL rewritten to `/`, so nothing downstream — including the PWA's
// start_url if the visitor installs from here — ever sees the path.
captureInviteFromUrl()

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root is missing from index.html.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
