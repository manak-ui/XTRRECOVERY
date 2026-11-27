import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    fallbackTitle="Unable to load KWG Arena"
    onReset={() => window.location.reload()}
  >
    <App />
  </ErrorBoundary>
);
