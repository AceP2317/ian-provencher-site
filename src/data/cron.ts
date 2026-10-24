// Typed loader over the committed public-safe cron snapshot (export-public.mjs, which
// reads every real scheduled job through scripts/lib/scheduled-jobs.mjs and publishes
// only what scripts/cron-public.json describes). Cadence is already rounded upstream;
// nothing here ever sees an exact time.
import data from './cron.generated.json';

export type Cadence =
  | 'Every few minutes' | 'Hourly' | 'Nightly' | 'Daily' | 'Weekly' | 'Monthly' | 'At sign-in' | 'At start-up';

export interface CronJob {
  /** Null for a job found on the estate but not yet described: counted, never named. */
  label: string | null;
  purpose: string | null;
  category: string | null;
  /** A host CLASS ("this PC", "an agents server"), never a machine name. */
  host: string;
  cadence: Cadence;
  status: 'running' | 'retired';
  retiredOn?: string | null;
  described: boolean;
  /** Identical jobs fold into one row; nine code-map rebuilds are one row with count 9. */
  count: number;
}

export const cronJobs = data as CronJob[];
export const runningJobs = cronJobs.filter((j) => j.status === 'running' && j.described);
export const retiredJobs = cronJobs.filter((j) => j.status === 'retired');
/** Every running job, described or not — the honest total. */
export const runningCount = cronJobs
  .filter((j) => j.status === 'running')
  .reduce((n, j) => n + j.count, 0);
export const undescribedCount = cronJobs
  .filter((j) => j.status === 'running' && !j.described)
  .reduce((n, j) => n + j.count, 0);

export const CADENCE_ORDER: Cadence[] = [
  'Every few minutes', 'Hourly', 'Nightly', 'Daily', 'Weekly', 'Monthly', 'At sign-in', 'At start-up',
];
