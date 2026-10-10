/**
 * resume.ts — the PUBLIC-SAFE living résumé (rendered at /resume).
 *
 * ⚠️  PUBLIC-SAFE SCAFFOLD. This is the generic, indexable version — it must
 *     stay firewall-clean: NEVER the employer's literal name; describe any
 *     employer generically ("a global home-appliance manufacturer"). Only
 *     public-safe facts live here — generic employer, real education, and a
 *     year-range tenure. Quantified metrics and certifications are deliberately
 *     kept OFF the public page (they belong in the private generator below); the
 *     page still renders empty fields cleanly (a dateless entry drops its date
 *     span; an empty education/certs array omits the whole section).
 *
 *     The FULL, employer-named résumé for job applications is generated privately
 *     by the Access-gated /admin generator (Worker: /api/admin/resume/generate)
 *     from the RESUME_KV `full` canonical (RESUME_FULL secret fallback), returned
 *     to the console and saved with its history in private KV (DESK_KV, D93) — it
 *     never lands in this file, the repo or the public build.
 */
import { site } from './site';

export interface ResumeExperience {
  role: string;
  /** GENERIC org descriptor — never the employer literal. */
  org: string;
  location?: string;
  /** Free-form dates, e.g. "2021 – Present". EMPTY renders no date span (Ian sets real values). */
  dates: string;
  summary: string;
  highlights: string[];
}

export interface ResumeSkillGroup {
  label: string;
  items: string[];
}

export interface ResumeCredential {
  /** Degree / certification name. */
  title: string;
  org: string;
  dates?: string;
}

export interface ResumeLink {
  label: string;
  href: string;
}

export const resume = {
  // D80 (2026-09-26): the overlap framing, his pick, replacing D42's "AI orchestrator" lead.
  // It opens with site.role and READS it, so the résumé cannot carry a second framing.
  headline:
    `${site.role} — the planning problems worked firsthand, and the software that fixes them directed and shipped end to end.`,
  summary:
    'I work in supply-chain operations — material availability and shortages, inventory policy, production planning and capacity, order fulfillment and service level, engineering change, inbound logistics and master data — and I direct AI to build the software those operations need: CLI coding agents and LLM pipelines, Python and TypeScript, React front ends on Cloudflare’s edge, real-time data systems. I design the system, steer the agents and hold the review gate on what they ship. The operations decide what gets built; AI is how it gets built.',
  location: 'United States',

  /** Public contact surfaces only — no personal email on the public page. */
  links: [
    { label: 'ian-provencher.com', href: 'https://ian-provencher.com' },
    { label: 'AppliedIQ Solutions', href: 'https://appliediqsolutions.com' },
    { label: 'Nextdoor — AppliedIQ', href: 'https://nextdoor.com/page/appliediq-solutions-new-bern-nc/' },
    { label: 'GitHub — AceP2317', href: 'https://github.com/AceP2317' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ian-provencher' },
  ] as ResumeLink[],

  experience: [
    {
      role: 'Founder & Operator',
      org: 'AppliedIQ Solutions',
      location: 'Remote',
      dates: '',
      summary:
        'A one-person practice: supply-chain planning tools built to order for manufacturers, and websites and finished tools for local businesses, each designed and shipped end to end.',
      highlights: [
        'Build and ship full-stack applications end to end — React 19 front ends, Cloudflare Workers + KV back ends, real-time data over server-sent events, and a local-first JSON file-database operations console — from design system to edge deploy.',
        'Work across Python (data tooling and automation), TypeScript / JavaScript, and Rust — including a cross-platform desktop-and-mobile PDF suite built on Tauri.',
        'Engineer production LLM features: Anthropic tool-use and structured-output pipelines, and streaming assistants that are rate-limited, spend-capped, and adversarially hardened.',
        'Orchestrate fleets of CLI coding agents — headless dispatch through an inbox → active → review → done queue with a human review gate enforced in code.',
        'Run zero-trust infrastructure solo — Cloudflare Access, Tunnels, Workers, and DNS over a private Tailscale mesh to a self-hosted server — behind a safe-export firewall that keeps private detail off the public web on every deploy.',
        'Prototype on representative, synthetic data by design: the architecture and domain logic are the deliverable, so tools prove out without ever touching a client’s private systems.',
      ],
    },
    {
      // Promoted to Supply Chain Material Analyst II in August 2026 (his word, 2026-09-27).
      role: 'Supply Chain Material Analyst II (Supply Chain Analyst, 2022 – 2026)',
      org: 'A global home-appliance manufacturer',
      location: 'North America',
      dates: '2022 – Present',
      summary:
        'End-to-end supply-chain operations — the flow of material through the plants and the systems that run it, from planning and sourcing to production, logistics, warehousing, and engineering.',
      highlights: [
        'Built working tools for material coverage and shortages, inventory policy and excess stock, capacity and line levelling, order-confirmation misses, engineering-change cut-over and inbound shipments.',
        'Help shape the strategy, scope, and rollout of AI across the company’s North America region.',
      ],
    },
  ] as ResumeExperience[],

  skills: [
    {
      label: 'Languages & runtimes',
      items: ['Python', 'TypeScript', 'JavaScript', 'Rust', 'SQL', 'Bash & PowerShell', 'HTML & CSS'],
    },
    {
      label: 'Full-stack & systems',
      items: ['Astro', 'React 19', 'Next.js', 'Node.js', 'Cloudflare Workers & KV', 'Real-time (SSE)', 'Local-first & file databases', 'Tauri (desktop + mobile)', 'Systems architecture'],
    },
    {
      label: 'Applied AI & agents',
      items: ['LLM application design', 'Anthropic tool-use & structured outputs', 'Agentic workflows', 'CLI-agent orchestration', 'Claude & Claude Code', 'Prompt engineering', 'MCP', 'AI adoption strategy'],
    },
    {
      label: 'Infrastructure & DevOps',
      items: ['Cloudflare (Access · Tunnels · Workers · DNS)', 'Tailscale mesh', 'Self-hosted server', 'Git & GitHub CLI', 'CI/CD', 'Zero-trust access', 'Safe-export security gating'],
    },
    {
      label: 'Supply chain & operations',
      items: ['End-to-end planning', 'MRP', 'Bill of materials (BOM)', 'Sourcing & procurement', 'Production planning', 'Logistics & warehousing', 'Inventory', 'S&OP'],
    },
  ] as ResumeSkillGroup[],

  education: [
    { title: 'B.S., Business Administration (minor, Management)', org: 'Eastern Connecticut State University' },
  ] as ResumeCredential[],

  /** Ian fills these — empty sections are omitted from the page. */
  certifications: [] as ResumeCredential[],
};

export type Resume = typeof resume;

/** JSON-LD for /resume — ProfilePage + BreadcrumbList over the site Person. */
export function resumeSchema(origin: string): Record<string, unknown>[] {
  const url = `${origin}/resume/`;
  return [
    {
      '@type': 'ProfilePage',
      '@id': `${url}#profilepage`,
      name: 'Ian Provencher — Résumé',
      url,
      description: resume.summary,
      isPartOf: { '@id': `${origin}/#website` },
      mainEntity: { '@id': `${origin}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Résumé' },
      ],
    },
  ];
}
