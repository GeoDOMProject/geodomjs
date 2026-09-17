# 1.3.2 — 2026-09-17

- Las etiquetas permanentes solo se muestran cuando la vista tiene hasta 40 territorios; en vistas densas se mantienen disponibles al señalar y el visor explica cómo fijarlas.
- Las etiquetas permanentes conservan los nombres en una línea y dejan de partirlos carácter por carácter.
- `Ver todo` conserva filtros, selección, zoom, posición y desplazamiento lateral para poder volver a la vista anterior.

# 1.3.1 — 2026-09-16

- El preset horizontal usa el identificador neutral `editorial`.
- Se eliminan identificadores y ejemplos ligados a casos particulares.

# 1.3.0 — 2026-09-16

- Preset para mapas editoriales horizontales con fondo oscuro y tipografía clara.
- Área de dibujo, posiciones y tamaños configurables para título, subtítulo, fuente y leyenda.
- Conteos opcionales y mayúsculas en leyendas categóricas SVG e interactivas.
- Tamaño de símbolos, separación y colores configurables en la leyenda.

# 1.2.0 — 2026-09-16

- Paletas continuas y discretas compartidas entre mapas SVG e interactivos.
- Colores manuales por categoría, con orden de dominio opcional.
- Colores configurables para el fondo y los territorios sin datos.
- Contratos TypeScript, validación de colores y pruebas de paridad actualizados.

# 1.1.1 — 2026-09-12

- Corrige el enlace de BP_CODE cuando la geometría de barrios/parajes usa SECC.
- Validación con la capa real completa de 12,612 territorios y una medición enlazada.
- Se conservan las etiquetas y archivos ya publicados de 1.1.0.

# 1.1.0 — 2026-09-12

- Mapas interactivos con navegación, búsqueda, selección, atributos y leyenda.
- Exploración provincial y municipal, con contexto sin mediciones claramente marcado.
- Exportación HTML con motor, estilos y geometrías incluidos; fondo de calles opcional.
- Contratos de coordenadas, ceros/ausencias, escape de contenido y uniones preservados.
- La versión anterior permanece en sus etiquetas y en freeze-2026-09-12.

# Cambios

## 1.0.0 — 2026-09-12

Validación de claves ambiguas y filas duplicadas; resolución de colisiones de la variable de color; tolerancia a fallos de almacenamiento en el navegador.
