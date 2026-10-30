// Conexión al Supabase de Dinamo con la llave de servicio, que solo vive en el
// servidor. Lo usan _gasto.js, _usuarios.js y _admin.js.
//
// El archivo empieza con guion bajo para que Vercel no lo publique como ruta.

export function conexion(variables = {}) {
  const llave = String(variables.SUPABASE_SERVICE_KEY ?? '').trim();
  const base = String(variables.SUPABASE_URL ?? '').trim();
  if (!llave || !base) return null;
  return {
    base: base.replace(/\/$/, ''),
    cabeceras: { apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
  };
}
