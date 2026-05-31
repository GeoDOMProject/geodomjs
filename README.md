# @geodom/core

Paquete JavaScript para usar datos y utilidades de GeoDOM en Node.js y navegadores.

## Instalación

```bash
npm install @geodom/core
```

## Uso rápido

```js
import {
  provinces,
  cleanProvName,
  detectLevel,
  gdMap
} from "@geodom/core";

const prov = await provinces();
const names = await cleanProvName(["santo domingo", "Elías Piña"]);

const datos = [
  { provincia: "Santo Domingo", poblacion: 2500000 },
  { provincia: "Santiago", poblacion: 1000000 }
];

const level = await detectLevel(datos);
const svg = await gdMap(datos, {
  level: "provinces",
  name: "provincia",
  key: "TOPONIMIA",
  fill: "poblacion"
});
```

También hay aliases estilo R/Python:

```js
import { gdProvinces, gdCleanProvName, gdMapData } from "@geodom/core";
```

## Alcance

El core cubre carga de datos, caché, limpieza de nombres, detección,
jerarquía, preparación de datos para mapas y renderizado SVG básico con
`gdMap()`. Para mapas interactivos, la salida de `mapData()` sirve como base
para adaptadores de Leaflet, MapLibre, D3 u otras librerías.

## Desarrollo

```bash
npm install
npm test
```

## Licencia

MIT
