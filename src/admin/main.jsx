import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import AdminApp from './AdminApp.jsx';
import '../index.css';
import './admin.css';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
