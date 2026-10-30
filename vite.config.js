import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { atenderPanel, atenderUsuarios } from './api/_admin.js';
import { registrarGasto } from './api/_gasto.js';
import { entornoDesde, reenviarAGemini } from './api/_proxy.js';
import {
  RESPUESTA_SIN_SESION,
  atenderLogin,
  atenderSesion,
  cookieBorrada,
  leerSesion,
  rolDe,
  secretoDe,
  tokenDeCookies,
} from './api/_sesion.js';
import { cargarUsuarios } from './api/_usuarios.js';

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
      // /admin es otra página (admin.html); en producción la sirve el rewrite de vercel.json.
      server.middlewares.use((req, res, next) => {
        if (/^\/admin\/?(\?|$)/.test(req.url)) req.url = '/admin.html';
        next();
      });

      server.middlewares.use('/api/login', async (req, res) => {
        const usuarios = await cargarUsuarios(variables);
        const { estado, cuerpo, cookie } = atenderLogin(await leerJson(req), variables, { usuarios });
        responderJson(res, estado, cuerpo, cookie);
      });
      server.middlewares.use('/api/logout', (req, res) => {
        responderJson(res, 200, { ok: true }, cookieBorrada(false));
      });
      server.middlewares.use('/api/sesion', async (req, res) => {
        const usuarios = await cargarUsuarios(variables);
        const { estado, cuerpo } = atenderSesion(req.headers.cookie, variables, Date.now(), usuarios);
        responderJson(res, estado, cuerpo);
      });

      server.middlewares.use('/api/admin', async (req, res) => {
        const { estado, cuerpo } = await atenderPanel(req.headers.cookie, req.url, variables);
        responderJson(res, estado, cuerpo);
      });

      server.middlewares.use('/api/usuarios', async (req, res) => {
        const cuerpo = req.method === 'POST' || req.method === 'PATCH' ? await leerJson(req) : null;
        const r = await atenderUsuarios(req.method, req.headers.cookie, req.url, cuerpo, variables);
        responderJson(res, r.estado, r.cuerpo);
      });

      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const usuarios = await cargarUsuarios(variables);
        const usuario = leerSesion(tokenDeCookies(req.headers.cookie), secretoDe(variables), Date.now(), usuarios);
        if (!usuario) {
          responderJson(res, 401, RESPUESTA_SIN_SESION);
          return;
        }

        // reenviarAGemini responde 400 a un cuerpo nulo.
        const cuerpo = await leerJson(req);

        const entorno = entornoDesde(variables);
        const respuesta = await reenviarAGemini(cuerpo, entorno);
        const { estado, texto } = respuesta;
        const costo = await registrarGasto(
          respuesta,
          {
            usuario,
            captura: req.headers['x-captura'],
            modelo: entorno.modelo,
            tipoCredito: req.headers['x-tipo-credito'],
          },
          variables,
        );
        if (rolDe(usuario, usuarios) === 'admin') res.setHeader('X-Costo-USD', String(costo));
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
    build: {
      rollupOptions: { input: { index: 'index.html', admin: 'admin.html' } },
    },
  };
});
