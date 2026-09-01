import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` no es opcional: la app se publica como sitio de proyecto en GitHub
// Pages, bajo /captura-automatizador/. Sin esto los assets se piden a la raíz
// del dominio y la página carga en blanco.
export default defineConfig({
  base: '/captura-automatizador/',
  plugins: [react()],
  server: { port: 5175 },
});
