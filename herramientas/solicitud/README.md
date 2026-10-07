# Medición del formato de solicitud de crédito

`src/lib/formatoSolicitud.js` (la geometría con que se dibuja la solicitud
impresa) sale de medir `formato-escaneado.webp`, el escaneo del formato de
papel de Dinamo (en blanco, sin datos de nadie). Si el formato cambia o algo no
coincide, se corrige aquí y se vuelve a generar; no a mano en el `.js`.

Requiere Python con `pillow`, `numpy` y `pymupdf`. Desde esta carpeta:

```bash
python 1-enderezar.py . 0.36        # recto.png y recto2.png (gira 0.36° y quita el corrimiento)
python 2-solo-texto.py . 165 1530   # solo_texto.png (borra líneas) y lista los renglones de texto
python 4-generar.py . ../../src/lib/formatoSolicitud.js
```

`3-etiquetas.py` es la lista de etiquetas con su caja aproximada; `4-generar.py`
la afina contra el escaneo, agrega líneas, rayitas, barras y casillas, y aplica
`desfases.json`.

Para comprobar: imprimir a PDF la solicitud vacía y medir cuánto se corre cada
etiqueta contra el original. Lo que salga con 2 px o más va a `desfases.json`
como `[índice, dx, dy]` (un dx de 4 o más suele ser una rayita vecina que
confunde la medida):

```bash
python 5-desfases.py . ../../src/lib/formatoSolicitud.js solicitud-vacia.pdf
```
