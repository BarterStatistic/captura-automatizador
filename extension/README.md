# Captura Automatizador — extensión de Edge

Teclea en la Captura de Ventas DSC de Dinamo el expediente que preparó
[`../captura-automatizador/`](../captura-automatizador/). Es el brazo; la app es
la cabeza.

**No presiona Grabar.** Llena todo, escribe el comentario «OK» y se detiene. El
botón `valida()` lo presiona una persona después de revisar: una captura de
crédito no se deshace.

**No espera a nadie (desde 1.8.0).** Una vez que empieza, llena de corrido y al
final manda un resumen «Pendiente a mano» que la app muestra arriba de la
bitácora: colonias de SEPOMEX con su pista (CP, colonia), los «Validar Datos»
que dependen de ellas, las preguntas de Dinamo, los datos que no venían, estado
y municipio de nacimiento, y Datos Fiscales si el trámite los pide.

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
                                                           │ de corrido
                                  background.js ◄──────────┘
  ▲                                  │
  └──── postMessage(evento) ◄────────┘   (al final: evento «resumen»)
```

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Permisos: solo Dinamo y el dominio de la app |
| `background.js` | Abre la pestaña, guarda el trabajo y enruta los eventos |
| `puente-captura.js` | Traduce entre la página de la app y la extensión |
| `dom.js` | Escritura sobre el DOM: esperas, setter nativo, selects |
| `campos.js` | El mapeo: secciones, ids, tipos y valores fijos |
| `contenido-captura.js` | El motor de llenado |
| `hook-avisos.js` | Captura `alert`, `confirm` y SweetAlert2 durante el llenado |

## Qué llena y qué no (desde 1.7.0)

**La moto es del vendedor.** Tipo de venta, modelo, color, plazo y servicio
preventivo se capturan a mano en Dinamo. La extensión empieza en «Buscar
cliente» y llega hasta las referencias.

**La pestaña de captura nunca se recarga** (se perdería la moto). Al presionar
«Llenar en Dinamo»:

- Si la captura ya está abierta, se llena ahí mismo, siempre que ya tenga un
  modelo elegido; si no, avisa que falta capturar la moto y no toca nada.
- Si no está abierta, la abre y pide capturar la moto y volver a presionar.

## El orden del cliente y las colonias

**Datos del cliente:** primero se busca el RFC en «Buscar cliente» (eso
habilita la sección), luego se escribe en `txtrfc` (al salir del campo Dinamo
calcula la fecha de nacimiento y valida la edad), y después el resto. Al final
se presionan «Validar email» y «Validar Datos» del cliente, que no dependen de
nadie. **Datos Fiscales ya no lo toca la extensión** (desde 1.8.0).

**SEPOMEX lo hace el vendedor.** La extensión llena domicilio, empleo y
referencias sin esperar la colonia. Sus «Validar Datos» no se presionan (sin
colonia, Dinamo los rechaza): quedan en el resumen con la pista de qué buscar.

**Empleo:** frecuencia de pago, día de pago (solo semanal) y sueldo mensual
salen de los depósitos de nómina que la app analizó. El sueldo va entero, sin
comas: `txtsueldo` solo acepta dígitos.

## Cosas que no son obvias

**Los campos bloqueados se escriben igual.** Dinamo deshabilita cada sección
hasta que se valida la anterior. Un campo `disabled` guarda el valor que se le
asigna, así que la extensión le da a cada sección 2 s para habilitarse y luego
escribe como esté; cuando el vendedor valida, los campos ya están llenos. Las
casillas y radios deshabilitados se marcan por `checked`, porque ahí el clic no
hace nada.

**Los botones se buscan por su `onclick`, nunca por id ni XPath.** Un XPath
absoluto se rompe en cuanto alguien inserta un `<tr>`; el nombre de la función
no.

**Las preguntas de Dinamo no se contestan solas, pero no detienen la corrida.**
Los avisos de un botón (SweetAlert) se anotan y se cierran; los que preguntan
algo («¿El cliente cuenta con homoclave?») se quedan en pantalla y pasan al
resumen.

**Las casillas de las referencias 2 y 3 se marcan solo si no lo están.** Un
segundo clic las desmarca y vuelve a esconder la sección.

## Probar sin tocar Dinamo

> La prueba que manda es `pruebas/campos.test.mjs` contra `ids-dinamo.json`
> (los ids del HTML real). La página simulada es anterior a la 1.4.0: no tiene
> `txtrfc` ni el resumen de pendientes.

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
sale su valor. También que Datos Fiscales y las esperas de colonia no volvieron
al motor.

## Si la app cambia de dominio

Hay que actualizar `host_permissions` y `content_scripts` en el manifest y volver
a cargar la extensión. Es el único acoplamiento entre las dos piezas.
