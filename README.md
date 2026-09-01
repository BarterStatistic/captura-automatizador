# Captura Automatizador

Automatiza la captura de crédito del sistema Dinamo a partir de los documentos
del cliente. Son dos piezas que se reparten el trabajo:

| Pieza | Qué hace |
|---|---|
| **La app web** (este repo, raíz) | Recibe seis documentos, los lee con Gemini, calcula el RFC y muestra el expediente para revisión |
| **La extensión de Edge** (`extension/`) | Recibe el expediente ya revisado y lo teclea en Dinamo |

**Úsala aquí: <https://barterstatistic.github.io/captura-automatizador/>**

## No presiona Grabar

La extensión llena todo, escribe el comentario «OK» y se detiene. El botón
Grabar lo presiona una persona después de revisar: una captura de crédito no se
deshace.

## Puesta en marcha

1. Abre <https://barterstatistic.github.io/captura-automatizador/> y pulsa
   **«Configurar key»**. Pega tu API key de Gemini
   ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Se guarda
   solo en ese navegador y nunca se publica.
2. Descarga este repo e instala la extensión: `edge://extensions` → «Modo de
   desarrollador» → «Cargar desempaquetada» → elige la carpeta `extension`.
3. Arrastra los seis documentos, revisa lo que leyó Gemini y pulsa
   **«Llenar en Dinamo»**.

Sin la extensión la app funciona igual, pero en vez de llenar ofrece copiar el
expediente para capturarlo a mano. Útil desde el celular, donde Edge y Chrome no
admiten extensiones.

## Los seis documentos

En este orden: INE frente, INE atrás, comprobante de domicilio, dos estados de
cuenta y el formulario que el cliente contesta por WhatsApp. Se aceptan fotos
(JPG, PNG, HEIC) y PDF.

Lo que ningún documento trae —los datos de la unidad, el celular del cliente y el
domicilio de las referencias— se captura en la propia app antes de llenar.

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5175/captura-automatizador/
npm test        # 64 pruebas de la app
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
| `lib/documentos.js` | los seis prompts y esquemas de Gemini | nada |
| `lib/expediente.js` | fusiona las lecturas y valida | rfc, normaliza, esquemas |
| `lib/gemini.js` | la llamada a la API | documentos |
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
