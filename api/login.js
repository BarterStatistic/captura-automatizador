// Función de Vercel: POST /api/login con { usuario, password }. Ver _sesion.js.

import { atenderLogin, esSegura } from './_sesion.js';
import { cargarUsuarios } from './_usuarios.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: { message: 'Solo se acepta POST.' } });
    return;
  }

  const usuarios = await cargarUsuarios(process.env);
  const { estado, cuerpo, cookie } = atenderLogin(req.body, process.env, { segura: esSegura(req.headers), usuarios });
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(cuerpo);
}
