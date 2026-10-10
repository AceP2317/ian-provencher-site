import { DAY_SECONDS } from './layout.js';

export const RATES = { pause: 0, real: 1, fast: 60, faster: 600, rewind: -600 };

// The estate's clock runs at a rate and never goes before its start. Everything that moves is a
// pure function of this one value, so rewinding to a time gives back exactly the picture at that time.
export function advanceSimT(t, dtReal, rate) {
  return Math.max(0, t + dtReal * rate);
}

export function formatSimTime(t) {
  const s = Math.floor(t);
  const day = Math.floor(s / DAY_SECONDS) + 1;
  const hh = Math.floor((s % DAY_SECONDS) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return `day ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
