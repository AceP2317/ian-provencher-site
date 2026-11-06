/** The shapes a scroll story is written in, shared by StoryFrame, StoryCard and every story. */
export const KIND = {
  setting: 'Setting', hook: 'Enforced by a hook', method: 'Instructed', harness: 'Built into Claude Code', measured: 'Measured',
  mod: 'A mod', rule: 'The rule', tool: 'A tool call', file: 'A file', person: 'His call', math: 'The math',
} as const;

export type StoryStage = { id: string; title: string; kind: keyof typeof KIND; state: Record<string, string | number | null> };
export type StoryRow = { k: string; label: string; type?: 'text' | 'big' | 'count' | 'lamps' | 'bar'; lamps?: string[]; wide?: boolean; phone?: false };

/**
 * A figure from the generated file, by path. In a production build a missing figure stops the build,
 * so a page can never ship a blank where a number belongs; in development it shows as "missing".
 */
export function figure<T = number>(root: unknown, path: string): T {
  const v = path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), root);
  if (v === undefined || v === null) {
    if (import.meta.env.PROD) throw new Error(`story figure "${path}" is missing from src/data/story-figures.generated.json`);
    return 'missing' as T;
  }
  return v as T;
}

export const n = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
export const pad = (i: number) => String(i).padStart(2, '0');

/** Eastern time, the operator's one zone: "07:42". */
export const et = (msEpoch: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(msEpoch));
/** A span as "6h 7m" or "41m". */
export const span = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
