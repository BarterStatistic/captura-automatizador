# Captura Automatizador — extensión de Edge

Teclea en la Captura de Ventas DSC de Dinamo el expediente que preparó
[`../captura-automatizador/`](../captura-automatizador/). Es el brazo; la app es
la cabeza.

**No presiona Grabar.** Llena todo, escribe el comentario «OK» y se detiene. El
botón `valida()` lo presiona una persona después de revisar: una captura de
crédito no se deshace.

La extensión no habla con Gemini, no tiene API key y no hace ninguna petición de
red. Escribe directo en el DOM, así que no hay CORS, ni contenido mixto, ni
Private Network Access, aunque la app esté en HTTPS y Dinamo en HTTP.

## Instalación

1. Copia la carpeta `dinamo-extension` a la máquina.
2. Abre **`edge://extensions`** (o `chrome://extensions`).
3. Activa **«Modo de desarrollador»**, abajo a la izquierda.
4. Clic en **«Cargar desempaquetada»** y elige esta carpeta.

Edge avisa de vez en cuando que hay una extensión en modo de desarrollador. Es
normal. Para quitarlo habría que publicarla en Edge Add-ons.

En celulares no se puede instalar: Chrome y Edge móviles no admiten extensiones.
Ahí la app llega hasta «Copiar expediente» y la captura se hace a mano.

## Cómo funciona por dentro

```
Pestaña de la app                  Extensión                Pestaña de Dinamo
─────────────────                  ─────────                ─────────────────
Botón «Llenar en Dinamo»
  │ postMessage(expediente)
  ▼
puente-captura.js ──sendMessage──► background.js
                                     │ abre o reusa la pestaña
                                     ▼
                                  (la página carga) ──►  contenido-captura.js
                                                           │ sección por sección
                                  background.js ◄──────────┘   │
  ▲                                  │                          ├─► SEPOMEX
  └──── postMessage(evento) ◄────────┘                          └─► Datos Fiscales
```

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Permisos: solo Dinamo y el dominio de la app |
| `background.js` | Abre la pestaña, guarda el trabajo y enruta los eventos |
| `puente-captura.js` | Traduce entre la página de la app y la extensión |
| `dom.js` | Escritura sobre el DOM: esperas, setter nativo, selects |
| `campos.js` | El mapeo: secciones, ids, tipos y valores fijos |
| `contenido-captura.js` | El motor de llenado |
| `contenido-sepomex.js` | La ventana de colonias |
| `contenido-fiscales.js` | La ventana de Datos Fiscales |
| `hook-avisos.js` | Captura `alert`, `confirm` y SweetAlert2 durante el llenado |

## Tres cosas que no son obvias

**Los campos nacen `disabled`.** Cada «Validar Datos» habilita la sección
siguiente, así que presionarlos no es opcional: son el motor del flujo. Si una
sección no se habilita, la corrida se detiene ahí en vez de seguir escribiendo
en campos que nadie lee.

**Los botones se buscan por su `onclick`, nunca por id ni XPath.** En Datos
Fiscales esto es crítico: `btnGuardarDatos` es el botón de **Cancelar** cuando el
cliente ya tenía datos capturados, y el que guarda es `btnModificarDatos`. Se
localiza el que llama a `validarDatosAEnviar`.

**El accesorio se busca por código de producto**, no por `canAcce_N`. Ese índice
es la posición en una lista que cambia con el modelo y la agencia; escribir en la
fila equivocada le cobraría al cliente un accesorio que no pidió. Si hay cero
coincidencias o más de una, no se escribe nada.

## Probar sin tocar Dinamo

`pruebas/captura-simulada.html` replica los ids, el `disabled` progresivo, los
`onclick` reales, una objeción vía `Swal.fire`, y la lista de accesorios con sus
códigos.

```bash
python -m http.server 8899 --bind 127.0.0.1
```

Abre <http://127.0.0.1:8899/pruebas/captura-simulada.html> y en la consola:

```js
await window.__correr()
```

Sírvela por HTTP, no como `file://`. Lo que debe salir:

| Comprobación | Esperado |
|---|---|
| `window.__grabarPresionado` | `false` — **siempre**, es la regla |
| `window.__eventos.filter(e => e.tipo === 'error')` | vacío |
| `window.__sepomexPedido` | `['CLI', 'EMP', 'REF']` |
| `canAcce_91` (código 590144001) | `1` |
| `canAcce_90` y `canAcce_92` | `0` — no se tocan |
| `txtlada_emp` / `txttelefono_emp` | `551` / `2345678` |
| `txtant_anios_emp` / `cboant_meses_emp` | `0` / `6` |
| `txtcomenta` | `OK` |

Y no la corras con jsdom: no implementa `event.source` en `postMessage`, así que
la captura de avisos parece rota cuando en un navegador real funciona.

## Pruebas del mapeo

```bash
npm test
```

Comprueban lo que no se puede ver a ojo en `campos.js`: que los valores fijos son
los del catálogo real, que ninguna sección invoca `valida()`, que los campos
`readonly` de SEPOMEX no se intentan escribir, y que cada campo dice de dónde
sale su valor.

## Si la app cambia de dominio

Hay que actualizar `host_permissions` y `content_scripts` en el manifest y volver
a cargar la extensión. Es el único acoplamiento entre las dos piezas.
