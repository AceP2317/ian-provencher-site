// Typed loader over the committed public-safe cron snapshot (export-public.mjs,
// sourced from Hermes model.public.json).
import data from './cron.generated.json';

export interface CronJob {
  label: string;
  schedule: string;
  purpose: string;
  host: string;
}

export const cronJobs = data as CronJob[];

/** Rough cadence bucket for a schedule string, for grouping/sorting. */
export function cadence(schedule: string): string {
  const s = schedule.toLowerCase();
  if (/every\s*\d*\s*min/.test(s)) return 'Every few minutes';
  if (/hour/.test(s)) return 'Hourly';
  if (/daily|:\d\d\b|utc|america\//.test(s)) return 'Daily';
  if (/week/.test(s)) return 'Weekly';
  return 'Scheduled';
}
