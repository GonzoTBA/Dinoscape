# Dinoscape

Juego cooperativo de dos dinosaurios que escapan de pozos recogiendo monedas antes de salir.

## Ejecutar

Desde esta carpeta:

```sh
php -S 127.0.0.1:8000
```

Luego abre:

```txt
http://127.0.0.1:8000
```

También puede abrirse `index.html` directamente en el navegador.

## Controles

- Lucky Dino azul: flechas izquierda/derecha, flecha arriba para saltar, flecha abajo para cargar salto.
- Papa Dino rojo: `Z`/`C` para moverse, `S` para saltar, `X` para cargar salto.

## Objetivo

Recoged todas las monedas del pozo. El pozo 1 tiene una moneda, el pozo 2 tiene dos, el pozo 3 tiene tres, y así sucesivamente. Cuando estén todas, la salida se abre y los dos dinos tienen que llegar arriba para pasar al siguiente pozo.
