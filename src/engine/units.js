/**
 * Unit conversion for numeric experiment conditions.
 *
 * Pure functions, no Forge APIs. The MVP supports four dimensions:
 * temperature (°C, K), time (min, h), concentration (wt%, ppm) and
 * pressure (kPa, bar). Any other unit (µm, %RH, ...) is only comparable
 * with itself.
 */

/**
 * Each known unit converts to and from the base unit of its dimension.
 * Base units: °C, min, wt%, kPa.
 */
const UNITS = {
  '°C': { dimension: 'temperature', toBase: (v) => v, fromBase: (v) => v },
  K: { dimension: 'temperature', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  min: { dimension: 'time', toBase: (v) => v, fromBase: (v) => v },
  h: { dimension: 'time', toBase: (v) => v * 60, fromBase: (v) => v / 60 },
  'wt%': { dimension: 'concentration', toBase: (v) => v, fromBase: (v) => v },
  ppm: { dimension: 'concentration', toBase: (v) => v / 10000, fromBase: (v) => v * 10000 },
  kPa: { dimension: 'pressure', toBase: (v) => v, fromBase: (v) => v },
  bar: { dimension: 'pressure', toBase: (v) => v * 100, fromBase: (v) => v / 100 },
};

/** Spellings people actually type, mapped to the canonical unit symbol. Keys are lower case. */
const ALIASES = {
  '°c': '°C', c: '°C', degc: '°C', 'deg c': '°C', celsius: '°C',
  k: 'K', kelvin: 'K',
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  'wt%': 'wt%', 'wt %': 'wt%', '%wt': 'wt%', 'wt.%': 'wt%',
  ppm: 'ppm',
  kpa: 'kPa',
  bar: 'bar',
  'µm': 'µm', um: 'µm', micron: 'µm', microns: 'µm',
  '%rh': '%RH', '% rh': '%RH',
};

/**
 * Returns the canonical spelling of a unit, or the trimmed input when the
 * unit is not known. An empty or missing unit becomes ''.
 */
export const normalizeUnit = (unit) => {
  // The Greek letter mu (U+03BC) and the micro sign (U+00B5) look the same; use one.
  const text = String(unit ?? '').trim().replace(/μ/g, 'µ').replace(/º/g, '°');
  if (!text) return '';
  return ALIASES[text.toLowerCase()] || text;
};

/** Dimension of a unit ("temperature", ...) or null when the unit is not convertible. */
export const dimensionOf = (unit) => UNITS[normalizeUnit(unit)]?.dimension || null;

/**
 * Converts a value between two units.
 * Returns null when the units belong to different dimensions or when one of
 * them is unknown and they are not the same unit.
 */
export const convert = (value, fromUnit, toUnit) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return value;
  const source = UNITS[from];
  const target = UNITS[to];
  if (!source || !target || source.dimension !== target.dimension) return null;
  return target.fromBase(source.toBase(value));
};

/**
 * Parses a number typed by a person. Accepts numbers and strings such as
 * "120", " 120.5 " or "1e-3". Returns null for anything that is not a finite number.
 */
export const parseNumber = (input) => {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/**
 * Splits a text such as "120 °C" or "45min" into a number and a unit.
 * Returns null when the text does not start with a number.
 */
export const parseQuantity = (input) => {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*?)\s*$/i.exec(String(input ?? ''));
  if (!match) return null;
  const value = parseNumber(match[1]);
  if (value === null) return null;
  return { value, unit: normalizeUnit(match[2]) };
};

/** Formats a number for display without long floating point tails. */
export const formatNumber = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return String(Number(value.toPrecision(6)));
};
