// Función de Vercel: POST /api/logout. Borra la cookie de sesión.

import { cookieBorrada, esSegura } from './_sesion.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', cookieBorrada(esSegura(req.headers)));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true });
}
