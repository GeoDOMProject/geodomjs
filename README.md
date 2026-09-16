# @geodom/core

Paquete JavaScript para usar datos y utilidades de GeoDOM en Node.js y navegadores.

## Instalación

```bash
npm install https://github.com/GeoDOMProject/geodomjs/releases/download/v1.2.0/geodom-core-1.2.0.tgz
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
  fill: "poblacion",
  palette: ["#f7fbff", "#08306b"],
  backgroundColor: "#eef4f1"
});
```

Para categorías, `colors` asigna un color exacto por valor:

```js
const colors = {
  "DAVID COLLADO": "#1565c0",
  "CAROLINA MEJÍA": "#ffffff",
  "WELLINGTON ARNAUD": "#f1d7a3",
  "LEONEL FERNÁNDEZ": "#2e7d32"
};
await gdMap(datos, { fill: "preferencia", colors, backgroundColor: "#526860" });
```

También hay aliases estilo R/Python:

```js
import { gdProvinces, gdCleanProvName, gdMapData } from "@geodom/core";
```

## Alcance

El core cubre carga de datos, caché, limpieza de nombres, detección,
jerarquía, preparación de datos para mapas y renderizado SVG básico con
`gdMap()`. El módulo `@geodom/core/interactive` añade mapas interactivos y HTML portable.

## Desarrollo

```bash
npm install
npm test
```

## Licencia

MIT

## Mapas interactivos (1.2.0)

```js
import { gdMapInteractive, mountInteractiveMap } from '@geodom/core/interactive';
import { writeFile } from 'node:fs/promises';
const data = [{ PROV_CODE: '01', valor: 0 }, { PROV_CODE: '25', valor: 34 }];
const options = { level: 'provinces', name: 'PROV_CODE', key: 'PROV_CODE', fill: 'valor' };
await writeFile('mapa.html', await gdMapInteractive(data, options));
// En un navegador con un contenedor:
// const viewer = await mountInteractiveMap(document.querySelector('#mapa'), data, options);
// viewer.destroy();
```

`interactiveData()` prepara las capas; `interactiveDocument()` crea HTML a partir
de esa preparación. `context: false` omite las capas adicionales. Las coordenadas
municipales de GeoDOM se transforman de EPSG:32619 a longitud/latitud antes de dibujar.
`toGeoJSON(source, { crs })` permite una conversión explícita de otra capa poligonal.

El código del visor está en `src/interactive-runtime.js`; `npm ci && npm run build`
genera los archivos distribuidos. Leaflet 1.9.4 está incluido con su licencia BSD.

El HTML incluye el visor, los estilos y las geometrías. Permite zoom, desplazamiento,
búsqueda por nombre o código, consulta de atributos y filtros por provincia y municipio.
Las capas de contexto se identifican como límites sin datos: no se reparten las cifras
de una provincia entre sus municipios. La leyenda conserva su escala al filtrar.

El fondo predeterminado funciona sin internet después de generar el archivo.
El fondo opcional de calles OpenStreetMap requiere conexión y conserva la atribución.
Las etiquetas permanentes se muestran hasta 300 territorios; en capas mayores se
consultan al señalar o tras filtrar. Los resultados de búsqueda muestran hasta 30
territorios a la vez; el mapa conserva todos los que coinciden.
