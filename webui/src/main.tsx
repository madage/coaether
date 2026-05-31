import React from 'react';
import ReactDOM from 'react-dom/client';
import { LangProvider } from './i18n/context';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
);
