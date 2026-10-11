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

## Catapulta

Lucky puede subirse a la cabeza de Papa y viajar con él. Si Papa carga el salto (`X`) con Lucky encima, la barra se vuelve azul; cargada a tope se vuelve morada y es la **supercatapulta**.

El cohete está tan alto que solo se alcanza con la supercatapulta. Cuando Lucky entra en el cohete, pulsa la flecha abajo para lanzar una escalera: Papa sube con `S` (y baja con `X`).

## Burbujas

Si un dino choca andando con un escarabajo, queda atrapado en una burbuja flotante. El otro dino lo libera tocando la burbuja. Tras el rescate, el dino parpadea un momento y los escarabajos no le hacen nada. Si los dos quedan atrapados, el pozo empieza de nuevo. Saltar encima de un escarabajo sigue aplastándolo.

## Mini dinos

En cada pozo hay un huevo escondido en alguna plataforma. Al tocarlo nace un mini dino que se une a la familia. Pueden ir hasta tres a la vez: cuando nace el cuarto, el mayor ya es grande, se despide y se va de aventura.

Los mini dinos van solos:

- **Siguen** al dino más cercano en fila, saltando y bajando de plataformas.
- **Exploran** (?): si ven una moneda cerca, van a por ella y la recogen.
- **Se asustan** (!): si se acerca un escarabajo, se esconden detrás de papá o de Lucky.
- **Celebran** (★): dan saltitos cuando cogen una moneda.

El más pequeño lleva la cáscara del huevo en la cabeza.

## Objetivo

Recoged todas las monedas del pozo. El pozo 1 tiene una moneda, el pozo 2 tiene dos, el pozo 3 tiene tres, y así sucesivamente. Cuando estén todas, la salida se abre y los dos dinos tienen que llegar arriba para pasar al siguiente pozo.
