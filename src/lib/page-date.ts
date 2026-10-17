/* "PAGE UPDATED": the day this page's own content last changed, beside the site's build stamp in
 * every footer (house rule, Ian 2026-10-08; D94). The build stamp says which build is live; this
 * says how current the page is, so a page untouched for a year says so. The rule itself lives in
 * page-day.mjs, where scripts/check-stamp.mjs --selftest runs it on fixtures.
 *
 * The days come from git, read once at config time (scripts/lib/build-stamp.cjs, fileDays) and
 * handed in as __FILE_DAYS__. A copy holding only part of its history gives null, and then no page
 * shows a day rather than every page showing the one day present. */
import freshness from '../data/freshness.json';
import { pageDayFrom } from './page-day.mjs';

declare const __FILE_DAYS__: Record<string, string> | null;
const DAYS: Record<string, string> | null = typeof __FILE_DAYS__ === 'undefined' ? null : __FILE_DAYS__;

export function pageDay(page: { routePattern: string; dataSlug?: string; dataDate?: string; sources?: string[] }): string | null {
  return pageDayFrom(DAYS, freshness.sections as Record<string, { lastChanged?: string }>, page);
}
