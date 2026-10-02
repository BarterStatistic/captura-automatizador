# Captura Automatizador

Automatiza la captura de crédito del sistema Dinamo a partir de los documentos
del cliente. Son dos piezas que se reparten el trabajo:

| Pieza | Qué hace |
|---|---|
| **La app web** (este repo, raíz) | Recibe los documentos y el formulario del vendedor, los lee con Gemini, calcula el RFC y muestra el expediente para revisión |
| **La extensión de Edge** (`extension/`) | Recibe el expediente ya revisado y lo teclea en Dinamo |

**Úsala aquí: <https://captura-automatizador.vercel.app/>**

Se publica en Vercel. La versión vieja de GitHub Pages pedía la API key en la
página; esta la guarda el servidor.

## No presiona Grabar

La extensión llena todo, escribe el comentario «OK» y se detiene. El botón
Grabar lo presiona una persona después de revisar: una captura de crédito no se
deshace.

## Puesta en marcha

1. La API key de Gemini **no se pide en la página**. Vive en la variable de
   entorno `GEMINI_API_KEY` del servidor:
   - En Vercel: proyecto `captura-automatizador` → Settings → Environment
     Variables → `GEMINI_API_KEY`, y volver a desplegar.
   - En local: en `.env.local` (no se sube a git; ver `.env.example`).

   La página llama a `/api/gemini` (función en `api/gemini.js`) y esa función le
   pone la clave. Nunca viaja al navegador.
2. Instala la extensión: `edge://extensions` → «Modo de desarrollador» →
   «Cargar desempaquetada» → elige la carpeta `extension`. Desde la 1.1.0
   reconoce el dominio de Vercel; si cambia el dominio, cambia `manifest.json`.
3. Suelta los documentos, pega el formulario del vendedor, revisa lo que leyó
   Gemini y pulsa **«Llenar en Dinamo»**.

Sin la extensión la app funciona igual, pero en vez de llenar ofrece copiar el
expediente para capturarlo a mano. Útil desde el celular, donde Edge y Chrome no
admiten extensiones.

## Documentos y formulario

**Documentos** (fotos JPG/PNG/HEIC o PDF): INE frente, INE atrás, comprobante de
domicilio y uno o dos estados de cuenta. Se sueltan **todos juntos** en cualquier
parte de la página, se pegan con Ctrl+V (p. ej. desde WhatsApp Web) o se eligen
varios a la vez. Gemini identifica cada archivo, lo acomoda en su casilla y lo lee
en ese momento. Una foto con los dos lados de la INE llena las dos casillas. Lo que
no reconoce se queda en una bandeja para acomodarlo a mano, y cualquier archivo se
puede mover de casilla.

**Formulario**: se pega el texto que manda el vendedor (el formulario que el
cliente contestó). Se lee al pegarlo. Además de los seis puntos, si el texto trae
celular del cliente, moto, esquema, plazo o más referencias, llena esos campos,
sin pisar lo que ya se haya elegido a mano.

Lo que nada de eso trae —la ubicación, y el domicilio de las referencias— se
captura en la propia app antes de llenar.

Límite: una petición a Vercel no pasa de 4.5 MB, así que un PDF de más de ~3 MB
se rechaza con un aviso (las fotos se reducen solas).

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5175 (con /api/gemini local, lee .env.local)
npm test        # pruebas de la app y del servidor
npm test --prefix extension   # 12 del mapeo de campos
```

Los datos de las pruebas son **ficticios**. El método se cotejó contra un
expediente real el 2026-08-31 y el RFC calculado coincidió con el que el sistema
tenía registrado, pero ese expediente no se guarda aquí porque el repositorio es
público.

## Los módulos

| Archivo | Qué hace | Depende de |
|---|---|---|
| `lib/rfc.js` | RFC desde CURP o desde nombre | nada |
| `lib/normaliza.js` | teléfonos, antigüedades, nombres, calles | nada |
| `lib/esquemas.js` | catálogos de venta y regla de referencias | nada |
| `lib/calles.js` | domicilios de referencia | nada |
| `lib/documentos.js` | prompts y esquemas de Gemini, clasificador y casillas | nada |
| `lib/formulario.js` | datos de venta del formulario → captura manual | esquemas |
| `lib/expediente.js` | fusiona las lecturas y valida | rfc, normaliza, esquemas |
| `lib/gemini.js` | arma la petición y la manda a `/api/gemini` | diagnostico |
| `api/_proxy.js` | servidor: agrega la clave y reenvía a Gemini | nada |
| `lib/extension.js` | protocolo con la extensión | nada |

`lib/extension.js` no tiene pruebas de nodo a propósito: todo lo que hace es
`postMessage` entre contextos del navegador, y jsdom no implementa
`event.source`, así que las pruebas darían falsos negativos. Se verifica con la
extensión instalada.

## Reglas que están codificadas aquí

Decisiones tomadas con el usuario el 2026-08-31, todas con prueba:

- El domicilio sale **siempre del comprobante**, nunca de la INE, y que el recibo
  esté a nombre de otra persona no es un error.
- El RFC genérico de los recibos (`XAXX010101000`) jamás llega al campo de RFC.
- Los teléfonos se parten 3 + 7 porque es lo único que aceptan `txtlada` y
  `txttelefono`, aunque la lada real sea de dos dígitos.
- Solo se pide una referencia, salvo en MOTOXPRESS y MOTOXPRESS FLEX, que piden
  tres.
- El domicilio de las referencias es **ficticio a propósito**: el formulario lo
  exige y el cliente no lo da. Se genera con calles reales de Saltillo, Ramos
  Arizpe y Arteaga, es determinista (el mismo expediente da el mismo domicilio,
  para poder cotejarlo después) y la pantalla lo marca como generado.
- Los datos del cliente **no se inventan nunca**: lo que falta sale en rojo y
  mantiene apagado el botón de llenado.

## La otra pieza

[`extension/README.md`](extension/README.md) explica el motor de llenado, cómo
probarlo contra el formulario simulado sin tocar Dinamo, y las tres trampas del
sistema que costaría caro pasar por alto.
