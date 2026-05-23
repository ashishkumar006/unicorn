import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
    <Toaster 
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-glass)',
        },
        success: {
          iconTheme: {
            primary: 'var(--primary-coral)',
            secondary: '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--error)',
            secondary: '#ffffff',
          },
        },
      }}
    />
  </BrowserRouter>
);
