/**
 * Apps & workflows — a hand-authored, public-safe view of the software behind the
 * work and how it's wired together. Curated from the installed-apps inventory plus
 * the mobile/alert workflow (kept generic — no bot names, tokens, or box detail).
 * Not auto-generated; edit this file directly.
 */
export interface App {
  name: string;
  /** How it's used, in a phrase. */
  role: string;
  url?: string;
}
export interface AppGroup {
  label: string;
  icon: string;
  accent: string;
  /** Optional one-line workflow note for the whole group. */
  workflow?: string;
  items: App[];
}

export const appGroups: AppGroup[] = [
  {
    label: 'Editor & shell',
    icon: 'wrench',
    accent: 'var(--color-accent)',
    items: [
      { name: 'VS Code', role: 'Primary editor', url: 'https://code.visualstudio.com' },
      { name: 'Claude Code', role: 'The CLI coding agent I orchestrate — interactively and in headless fleets', url: 'https://www.claude.com/product/claude-code' },
      { name: 'Windows Terminal', role: 'Where the shells live' },
      { name: 'PowerShell', role: 'Default shell for scripts and ops' },
    ],
  },
  {
    label: 'Languages & CLI',
    icon: 'git-branch',
    accent: 'var(--color-cyan)',
    items: [
      { name: 'Git + GitHub CLI', role: 'Version control and repo automation' },
      { name: 'Node.js (LTS)', role: 'Runtime for the sites and build scripts' },
      { name: 'TypeScript', role: 'Primary language — the sites, the console, and the PDF suite' },
      { name: 'Python 3.12 / 3.14', role: 'Data tooling, automation, and analysis scripting' },
      { name: 'Rust (rustup)', role: 'Systems-level tools and the Tauri core of the cross-platform PDF suite' },
      { name: 'ripgrep + jq', role: 'Fast code search and JSON surgery' },
      { name: 'Android SDK · JDK · Gradle', role: 'Builds the Command Center OS phone app from the command line — no Android Studio' },
    ],
  },
  {
    label: 'Knowledge & AI',
    icon: 'radar',
    accent: 'var(--color-accent-2)',
    workflow: 'The vault is the durable memory; Claude reads and writes it over MCP.',
    items: [
      { name: 'Obsidian', role: 'The knowledge vault — durable, linked, git-backed', url: 'https://obsidian.md' },
      { name: 'Claude', role: 'The engine behind everything I build', url: 'https://claude.ai' },
      { name: 'Abacus.AI DeepAgent', role: 'Deploy target — mirrors Claude-built apps to a managed full-stack cloud host', url: 'https://abacus.ai' },
    ],
  },
  {
    label: 'Infrastructure',
    icon: 'network',
    accent: 'var(--color-cyan-deep)',
    items: [
      { name: 'Private mesh', role: 'How I reach my boxes securely — a WireGuard-based network with no port-forwarding' },
      { name: 'Cloudflare', role: 'DNS, tunnels, zero-trust access, Workers + KV, and where sites deploy', url: 'https://cloudflare.com' },
      { name: 'Operator-token access', role: 'A long-lived operator token plus private-mesh ACLs gate who reaches the console — scoped and revocable' },
    ],
  },
  {
    label: 'Mobile & alerts',
    icon: 'layout-grid',
    accent: 'var(--color-up)',
    workflow: 'The pattern: my systems reach me on my phone, and I can dispatch work back from it.',
    items: [
      { name: 'GitHub Mobile', role: 'File an issue from anywhere; the agents pick it up' },
      { name: 'Self-hosted push', role: 'Job failures and heartbeats hit my phone' },
      { name: 'Chat bridge', role: 'Where my agents ping me with status and ask for a call' },
      { name: 'Mobile SSH', role: 'A live shell into my server from my Android phone, from anywhere' },
    ],
  },
  {
    label: 'Capture & creative',
    icon: 'bookmark',
    accent: 'var(--color-label)',
    items: [
      { name: 'Screenpresso', role: 'Fast screen capture for docs and demos' },
      { name: 'Adobe Creative Cloud', role: 'Brand and visual assets' },
      { name: 'CapCut', role: 'Short-form video edits' },
    ],
  },
];
