// Where a desk posting's text came from, when it is the whole posting rather than a feed's summary.
export const WHOLE_POSTING_FROM = ['feed', 'page', 'pasted', 'employer'];

// The big job sites he trusts, by domain. A job the finder could not confirm at its employer links to
// one of these from his private desk, or to nothing; never to a résumé-service copy (D110).
export const TRUSTED_SITES = { 'linkedin.com': 'LinkedIn', 'indeed.com': 'Indeed', 'glassdoor.com': 'Glassdoor', 'ziprecruiter.com': 'ZipRecruiter', 'usajobs.gov': 'USAJOBS' };

// The name of the trusted site a link is on, or '' when it is on none of them.
export function trustedSite(url) {
  let host;
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return ''; }
  for (const [domain, name] of Object.entries(TRUSTED_SITES)) if (host === domain || host.endsWith(`.${domain}`)) return name;
  return '';
}
