// Función de Vercel: GET /api/admin?periodo=dia|semana|mes|trimestre. Balance del panel de /admin.
// Solo para el administrador (ver atenderPanel en _admin.js).

import { atenderPanel } from './_admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { estado, cuerpo } = await atenderPanel(req.headers.cookie, req.url, process.env);
  res.status(estado).json(cuerpo);
}
