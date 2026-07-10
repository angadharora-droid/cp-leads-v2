import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      richColors
      closeButton
      position="top-right"
      toastOptions={{ className: 'font-sans' }}
    />
  </React.StrictMode>
);
