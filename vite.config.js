import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { entornoDesde, reenviarAGemini } from './api/_proxy.js';
import {
  RESPUESTA_SIN_SESION,
  atenderLogin,
  atenderSesion,
  cookieBorrada,
  haySesion,
} from './api/_sesion.js';

async function leerJson(req) {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    return null;
  }
}

function responderJson(res, estado, cuerpo, cookie) {
  res.statusCode = estado;
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
}

// En producción /api/* lo atienden las funciones de Vercel (api/). En
// `npm run dev` no hay Vercel, así que estos middlewares hacen lo mismo con la
// clave de .env.local. Así se prueba en local sin instalar la CLI de Vercel.
function apiGeminiLocal(variables) {
  return {
    name: 'api-gemini-local',
    configureServer(server) {
      server.middlewares.use('/api/login', async (req, res) => {
        const { estado, cuerpo, cookie } = atenderLogin(await leerJson(req), variables);
        responderJson(res, estado, cuerpo, cookie);
      });
      server.middlewares.use('/api/logout', (req, res) => {
        responderJson(res, 200, { ok: true }, cookieBorrada(false));
      });
      server.middlewares.use('/api/sesion', (req, res) => {
        const { estado, cuerpo } = atenderSesion(req.headers.cookie, variables);
        responderJson(res, estado, cuerpo);
      });

      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!haySesion(req.headers.cookie, variables)) {
          responderJson(res, 401, RESPUESTA_SIN_SESION);
          return;
        }

        // reenviarAGemini responde 400 a un cuerpo nulo.
        const cuerpo = await leerJson(req);

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
