// Site-wide metadata — a single source of truth for identity + social links.
export const site = {
  name: 'Ian Provencher',
  shortName: 'Ian Provencher',
  domain: 'ian-provencher.com',
  url: 'https://ian-provencher.com',
  author: 'Ian Provencher',
  role: 'Supply-chain operator & software builder',
  tagline: 'I build the operational software big systems leave out — full-stack, with AI woven through.',
  description:
    "Ian Provencher's public workspace — the repos, builds, cron jobs, apps, and architectures behind the work, plus field notes.",
} as const;

// Public profiles — used for JSON-LD `sameAs`, the footer, and the About "Connect" row.
export const socials: { label: string; href: string }[] = [
  { label: 'GitHub', href: 'https://github.com/AceP2317' },
  { label: 'AppliedIQ', href: 'https://appliediqsolutions.com' },
  { label: 'Nextdoor', href: 'https://nextdoor.com/page/appliediq-solutions-new-bern-nc/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ian-provencher' },
];

export const sameAs = socials.map((s) => s.href);
