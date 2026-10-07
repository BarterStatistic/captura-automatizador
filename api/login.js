// Función de Vercel: POST /api/login con { usuario, password }. Ver _sesion.js.

import { atenderLogin, esSegura } from './_sesion.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: { message: 'Solo se acepta POST.' } });
    return;
  }

  const { estado, cuerpo, cookie } = atenderLogin(req.body, process.env, { segura: esSegura(req.headers) });
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(cuerpo);
}
