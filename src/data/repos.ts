// Typed loader over the committed public-repos snapshot (scripts/fetch-repos.mjs).
import data from './repos.generated.json';

export interface Repo {
  name: string; description: string; url: string; homepage: string | null;
  language: string | null; topics: string[]; stars: number; forks: number;
  isFork: boolean; archived: boolean; pushedAt: string;
  featured: boolean; pinned: boolean;
}

export const repos = data as Repo[];

// A small color-by-language map for the language dot (falls back to ink-faint).
export const LANG_COLOR: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c',
  Astro: '#ff5d01', Python: '#3572A5', Rust: '#dea584', Shell: '#89e051',
  Vue: '#41b883', Svelte: '#ff3e00', Go: '#00ADD8', 'Jupyter Notebook': '#DA5B0B',
};
