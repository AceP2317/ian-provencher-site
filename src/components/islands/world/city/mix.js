// The sound levels for the city's state. Pure, so the rules are checked without a browser, and imported on
// the page's first load, so it stays apart from the audio code that loads only after a press of Sound.
const HUM = 0.12;
const RAIN = 0.25;
const ENGINE = 0.08;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function soundPlan({ rain, driving, speed, muted }) {
  if (muted) return { hum: 0, rain: 0, engine: 0, engineHz: 0 };
  return {
    hum: HUM,
    rain: RAIN * clamp01(rain),
    engine: driving ? ENGINE : 0,
    engineHz: 40 + 12 * Math.max(0, speed),
  };
}
