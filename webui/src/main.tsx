import React from 'react';
import ReactDOM from 'react-dom/client';
import { LangProvider } from './i18n/context';
import { DashboardWSProvider } from './hooks/DashboardWSContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <LangProvider>
    <DashboardWSProvider>
      <App />
    </DashboardWSProvider>
  </LangProvider>,
);
