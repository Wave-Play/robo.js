import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import './App.css'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

const el = document.getElementById('root')!
if (!el.innerHTML) {
  ReactDOM.createRoot(el).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
