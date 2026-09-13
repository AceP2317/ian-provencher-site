/**
 * palette.ts — the design tokens, readable from build-time code.
 *
 * WHY THIS EXISTS. `global.css` is the single source of truth for colour, and a handful
 * of places cannot use a CSS variable at all: a `<meta name="theme-color">` value, the
 * web manifest's `theme_color` and `background_color`, and anything handed to a canvas
 * or an image generator. Every one of those had a hand-typed hex sitting beside a
 * comment saying the tokens were single-source.
 *
 * MEASURED 2026-08-26, on the dark-to-light switch: the asset generator derived exactly
 * four values and hand-typed the rest, so it ran, printed success, and wrote 36 social
 * cards and the whole favicon suite in the OLD palette. The browser-chrome colour and
 * the manifest carried their own third and fourth copies. LEDGER L-196.
 *
 * `?raw` is how this stays honest: Vite hands back the stylesheet's own text, so there
 * is no second file to keep in step and no build step to remember. Ask for a token that
 * does not exist and it throws at build rather than rendering something plausible.
 */
import cssSrc from '../styles/global.css?raw';

/** oklch(L C H) → #rrggbb. sRGB only; out-of-gamut components clamp. */
function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return '#' + lin.map(enc).join('');
}

/**
 * One `--color-*` token, normalised to a hex string.
 *
 * The regex is a real RegExp literal on purpose. The generator's version was built with
 * `new RegExp(\`--color-${name}\s*:\s*...\`)` inside a TEMPLATE LITERAL, where `\s` is an
 * unrecognised escape and collapses to a bare `s` — so the pattern was really
 * `--color-canvass*:s*`, and it matched only because nothing in the file happens to put a
 * space before its colon. It would have failed silently the day someone did.
 */
export function token(name: string): string {
  const m = cssSrc.match(new RegExp(String.raw`--color-${name}\s*:\s*([^;]+);`));
  if (!m) throw new Error(`palette: --color-${name} is not defined in global.css`);
  const v = m[1].trim();
  if (v.startsWith('#')) return v;
  const o = v.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/);
  if (o) {
    const L = parseFloat(o[1]);
    return oklchToHex(L > 1 ? L / 100 : L, +o[2], +o[3]);
  }
  throw new Error(`palette: cannot convert --color-${name}: ${v}`);
}

/**
 * The values build-time consumers actually need.
 *
 * `themeColor` is the CANVAS, never the accent. It tints the browser's own chrome on
 * mobile, so it has to match the page the reader is looking at — an accent there paints
 * a band of brand colour above a page that is not that colour.
 */
export const palette = {
  canvas: token('canvas'),
  surface: token('surface'),
  ink: token('ink'),
  accent: token('accent'),
  themeColor: token('canvas'),
} as const;
