import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { entornoDesde, reenviarAGemini } from './api/_proxy.js';

// En producción /api/gemini lo atiende la función de Vercel (api/gemini.js).
// En `npm run dev` no hay Vercel, así que este middleware hace lo mismo con la
// clave de .env.local. Así se prueba en local sin instalar la CLI de Vercel.
function apiGeminiLocal(variables) {
  return {
    name: 'api-gemini-local',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        const trozos = [];
        for await (const trozo of req) trozos.push(trozo);

        let cuerpo = null;
        try {
          cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8'));
        } catch {
          // reenviarAGemini responde 400 a un cuerpo nulo.
        }

        const { estado, texto } = await reenviarAGemini(cuerpo, entornoDesde(variables));
        res.statusCode = estado;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(texto);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // El prefijo vacío carga también GEMINI_API_KEY. Esto solo corre en Node: lo
  // que llega al navegador sigue siendo únicamente lo que empiece con VITE_.
  const variables = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), apiGeminiLocal(variables)],
    server: { port: 5175 },
  };
});
