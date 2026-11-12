import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'
import { bootSet } from './boot'

bootSet(33, '載入程式完成，準備場景… / Preparing scene…')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
