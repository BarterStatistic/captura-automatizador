// Función de Vercel: gestor de usuarios de /admin (GET, POST, PATCH ?id=, DELETE ?id=).
// Solo para el administrador (ver atenderUsuarios en _admin.js).

import { atenderUsuarios } from './_admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { estado, cuerpo } = await atenderUsuarios(req.method, req.headers.cookie, req.url, req.body, process.env);
  res.status(estado).json(cuerpo);
}
