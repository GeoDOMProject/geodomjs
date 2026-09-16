const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const PALETTES = Object.freeze({
  viridis: Object.freeze(["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#fde725"]),
  plasma: Object.freeze(["#0d0887", "#5b02a3", "#9a179b", "#cb4679", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"]),
  inferno: Object.freeze(["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#fcffa4"]),
  magma: Object.freeze(["#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f", "#cd4071", "#f1605d", "#fd9668", "#fcfdbf"]),
  cividis: Object.freeze(["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8678", "#a59c74", "#c3b369", "#e1cc55", "#fee838"]),
  blues: Object.freeze(["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"]),
  greens: Object.freeze(["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"]),
  orangeblue: Object.freeze(["#b35806", "#e08214", "#fdb863", "#fee0b6", "#f7f7f7", "#d8daeb", "#b2abd2", "#8073ac", "#542788"]),
  geodom: Object.freeze(["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab", "#2f4b7c", "#a05195", "#d45087", "#f95d6a", "#ff7c43", "#ffa600"]),
  tableau: Object.freeze(["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab"]),
  set2: Object.freeze(["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"]),
  dark2: Object.freeze(["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"]),
  pastel: Object.freeze(["#b3e2cd", "#fdcdac", "#cbd5e8", "#f4cae4", "#e6f5c9", "#fff2ae", "#f1e2cc", "#cccccc"]),
  highcontrast: Object.freeze(["#004488", "#ddaa33", "#bb5566", "#000000", "#228833", "#aa3377", "#66ccee", "#ee7733"])
});

export const CONTINUOUS_PALETTES = Object.freeze(["viridis", "plasma", "inferno", "magma", "cividis", "blues", "greens", "orangeblue"]);
export const DISCRETE_PALETTES = Object.freeze(["geodom", "tableau", "set2", "dark2", "pastel", "highcontrast"]);

export function normalizeHexColor(value, label = "color") {
  const color = String(value ?? "").trim().toLowerCase();
  if (!HEX_COLOR.test(color)) throw new Error(`${label} debe ser un color hexadecimal como #336699.`);
  if (color.length === 4) return `#${[...color.slice(1)].map(character => character.repeat(2)).join("")}`;
  return color;
}

export function resolvePalette(palette, { numeric = true } = {}) {
  const fallback = numeric ? "viridis" : "geodom";
  if (palette == null || palette === "" || palette === "auto") return [...PALETTES[fallback]];
  if (Array.isArray(palette)) {
    const colors = palette.map((color, index) => normalizeHexColor(color, `El color ${index + 1} de la paleta`));
    if (colors.length < (numeric ? 2 : 1)) throw new Error(numeric ? "Una paleta continua necesita al menos dos colores." : "La paleta discreta necesita al menos un color.");
    return colors;
  }
  const key = String(palette).trim().toLowerCase();
  if (!PALETTES[key]) throw new Error(`Paleta desconocida: ${palette}.`);
  return [...PALETTES[key]];
}

export function paletteColor(colors, t) {
  const clamped = Math.max(0, Math.min(1, Number(t)));
  if (colors.length === 1) return colors[0];
  const position = clamped * (colors.length - 1);
  const lower = Math.min(Math.floor(position), colors.length - 2);
  return mixHex(colors[lower], colors[lower + 1], position - lower);
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const rgb = ca.map((value, index) => Math.round(value + (cb[index] - value) * t));
  return `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
}
