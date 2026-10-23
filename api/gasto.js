// Función de Vercel: GET /api/gasto?periodo=dia|semana|mes|trimestre. Gasto en Gemini.
// Solo para administradores (ver atenderGasto en _gasto.js).

import { atenderGasto } from './_gasto.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { estado, cuerpo } = await atenderGasto(req.headers.cookie, req.url, process.env);
  res.status(estado).json(cuerpo);
}
