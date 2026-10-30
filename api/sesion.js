// Función de Vercel: GET /api/sesion. Dice si hay sesión abierta y de quién.

import { atenderSesion } from './_sesion.js';
import { cargarUsuarios } from './_usuarios.js';

export default async function handler(req, res) {
  const usuarios = await cargarUsuarios(process.env);
  const { estado, cuerpo } = atenderSesion(req.headers.cookie, process.env, Date.now(), usuarios);
  res.setHeader('Cache-Control', 'no-store');
  res.status(estado).json(cuerpo);
}
