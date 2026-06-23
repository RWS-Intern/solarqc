import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  const appStartTime = Date.now();
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload if app has been running for more than 2 seconds
    // Prevents reload loop on first install
    if (Date.now() - appStartTime > 2000) {
      window.location.reload();
    }
  });
}
