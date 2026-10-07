import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Acceso from './components/Acceso.jsx';
import './index.css';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <Acceso />
  </StrictMode>,
);
