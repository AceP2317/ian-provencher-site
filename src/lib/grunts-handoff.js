// Send to Grunts (2026-11-09, Grunts D55). The desk opens Grunts with one job in the link's fragment,
// "#apply=" and base64url JSON, which Grunts' site/handoff.js reads back. A fragment never reaches a server,
// so the job and its two Word files travel through his own browser and no key passes between the sites.
// scripts/walk-desk.mjs decodes this file's output with Grunts' own reader, so the two cannot drift apart.
export const GRUNTS_URL = 'https://grunts.ian-provencher.com/';
// Grunts refuses a fragment past this many characters (its HANDOFF_MAX), so the desk refuses it first.
export const HANDOFF_MAX = 1_500_000;

const base64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A Word file as the payload carries it: a .docx name with no slashes, and its bytes. */
export const wordFile = (name, bytes) => ({ name: `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.docx`, data: base64url(bytes) });

/** The fragment for one job: { url, role, employer, posting, brief, resume, letter }. */
export const handoffFragment = (payload) => `#apply=${base64url(new TextEncoder().encode(JSON.stringify(payload)))}`;
