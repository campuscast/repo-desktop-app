import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './globals.css'

window.electronAPI.startupMark('renderer:entry', 'main.tsx loaded')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
})

window.electronAPI.startupMark('renderer:react-render:start')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
window.electronAPI.startupMark('renderer:react-render:committed')
requestAnimationFrame(() => {
  window.electronAPI.startupMark('renderer:first-animation-frame')
})
