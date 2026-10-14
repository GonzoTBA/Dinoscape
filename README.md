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

El cohete está tan alto que solo se alcanza con la supercatapulta. Arriba espera tumbado sobre un andamio. Cuando Lucky llega, pulsa ↓ para lanzar la escalera y después ↑ para activar el mecanismo que pone el cohete en vertical. Papa sube por la escalera con `S` (y baja con `X`). Con el cohete de pie y todos dentro, ¡despegue!

## Burbujas

Si un dino choca andando con un escarabajo, queda atrapado en una burbuja flotante. El otro dino lo libera tocando la burbuja. Tras el rescate, el dino parpadea un momento y los escarabajos no le hacen nada. Si los dos quedan atrapados, el pozo empieza de nuevo. Saltar encima de un escarabajo sigue aplastándolo.

## Mini dinos

En cada pozo hay un huevo escondido en alguna plataforma. Al tocarlo nace un mini dino. Papa y Lucky pueden tener uno cada uno: el huevo es para quien lo toca, o para el otro si quien lo toca ya tiene el suyo. Si los dos ya tienen, el mini dino mayor de quien lo toca se hace grande: le salen alas, se despide y sale volando hasta perderse por arriba.

Los mini dinos van solos:

- **Siguen** a su dino, saltando y bajando de plataformas.
- **Se asustan** (!): si se acerca un escarabajo, se esconden detrás de su dino.
- **Celebran** (★): dan saltitos cuando su dino coge una moneda.

Las monedas solo las pueden coger Papa y Lucky.

**Al rescate:** si Papa o Lucky quedan atrapados en una burbuja, sus controles pasan a su mini dino (sale una flechita encima). Llévalo hasta la burbuja y salta para reventarla. Si los dos quedan atrapados pero tienen mini dino, aún pueden salvarse.

El más pequeño lleva la cáscara del huevo en la cabeza.

Cuando la escalera del cohete está puesta y tenéis todas las monedas, los mini dinos van solos hasta ella y suben. El cohete no despega hasta que están todos dentro. Si los dos dinos grandes llegan al cohete sin escalera, se despliega sola para los pequeños. Los mini dinos calculan el camino de plataforma en plataforma; si alguno se atasca, le salen alas y vuela hasta la escalera.

## Objetivo

Recoged todas las monedas del pozo. El pozo 1 tiene una moneda, el pozo 2 tiene dos, el pozo 3 tiene tres, y así sucesivamente. Cuando estén todas, la salida se abre y los dos dinos tienen que llegar arriba para pasar al siguiente pozo.
