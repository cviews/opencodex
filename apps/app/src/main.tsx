import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { SDKProvider } from './sdk/provider';
import { SDKEventSubscriber } from './sdk/SDKEventSubscriber';
import { I18nProvider } from './i18n';
import { installGlobalErrorLogging } from './utils/installGlobalErrorLogging';

installGlobalErrorLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <SDKProvider>
        <SDKEventSubscriber>
          <App />
        </SDKEventSubscriber>
      </SDKProvider>
    </I18nProvider>
  </StrictMode>,
);
