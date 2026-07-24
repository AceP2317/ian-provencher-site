import { useState, useEffect } from 'react';
import { copyFormatted } from '../../lib/md-clipboard.js';

/* ============================================================================
   AdminConsole — the private paste-to-publish console (mounted on /admin).
   Three tabs, each an AI-assisted fetch → review → publish flow:
     • Blog      → /api/admin/blog/analyze  → /api/admin/blog
     • Signal    → /api/admin/news/analyze  → /api/admin/news/publish
     • Favorites → /api/admin/favorites/analyze → /api/admin/favorites/publish
   Same-origin fetches, so Cloudflare Access's CF_Authorization cookie rides along
   automatically — the client never handles a token. The Worker validates,
   firewall-scans, and commits the markdown to src/content/*; CI + the safe-export
   gate do the rest (~1 min to live). Every tab has a "fill it in manually" escape,
   so publishing works even when AI drafting is unconfigured or unavailable.
   ============================================================================ */

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-2 focus:outline-none focus:ring-2 focus:ring-accent/40';

// Kept in sync with BLOG_SOURCES in src/data/blog.ts.
const SOURCES = [
  ['authored', 'Written here — gets its own /blog/… page'],
  ['linkedin', 'LinkedIn — syndicated (needs original URL)'],
  ['x', 'X — syndicated (needs original URL)'],
  ['press', 'Press — syndicated (needs original URL)'],
  ['external', 'External — syndicated (needs original URL)'],
];

// Kept in sync with FAVORITE_CATEGORIES + CATEGORY_META in src/data/favorites.ts.
const FAV_CATEGORIES = [
  ['ai', 'AI'],
  ['dev-tools', 'Dev tools'],
  ['docs', 'Docs & references'],
  ['infra', 'Infrastructure'],
  ['design', 'Design'],
  ['supply-chain', 'Supply chain'],
  ['reading', 'Reading'],
  ['inspiration', 'Inspiration'],
];

// Kept in sync with TIP_CATEGORIES + CATEGORY_META in src/data/tips.ts.
const TIP_CATEGORIES = [
  ['optimization', 'Optimization'],
  ['workflow', 'Workflow'],
  ['tooling', 'Tooling'],
  ['ai', 'AI'],
  ['ops', 'Ops'],
];

// Kept in sync with GLOSSARY_CATEGORIES + CATEGORY_META in src/data/glossary.ts
// (Glossary and Learn share this vocabulary).
const GLOSSARY_CAT_OPTIONS = [
  ['ai', 'AI & Machine Learning'],
  ['software', 'Software Development'],
  ['web', 'Web & Frontend'],
  ['data', 'Data & Databases'],
  ['infra', 'Infrastructure & DevOps'],
  ['security', 'Security'],
  ['systems', 'Systems & Networking'],
  ['supply-chain', 'Supply Chain & Operations'],
];

// POST JSON and normalize the outcome. An expired Access session answers a fetch
// with the login HTML instead of our JSON — detect that and ask for a reload.
async function postJson(endpoint, payload) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { networkError: true };
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // Access login page / redirect, or an unexpected non-JSON error.
    return { sessionExpired: res.status === 200 || res.redirected, status: res.status };
  }
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono-label">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Counter({ value, min, max }) {
  const n = (value || '').length;
  const ok = n >= (min || 0) && n <= max;
  return (
    <span className={`text-xs ${ok ? 'text-ink-faint' : 'text-down'}`}>
      {n}
      {min ? `/${min}–${max}` : `/${max}`}
    </span>
  );
}

function Warnings({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="rounded-lg border border-down/40 bg-down/5 p-3 text-xs text-down">
      {items.map((w, i) => <li key={i}>• {w}</li>)}
    </ul>
  );
}

function Result({ result, onReset }) {
  if (result.sessionExpired) {
    return (
      <div className="panel p-6" role="alert">
        <p className="mono-label text-down">Session expired</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your Cloudflare Access session timed out.{' '}
          <button onClick={() => window.location.reload()} className="font-medium text-cyan-deep underline">
            Reload to sign in
          </button>{' '}
          and try again.
        </p>
      </div>
    );
  }
  if (result.ok) {
    return (
      <div className="panel flex flex-col items-start gap-3 p-6" role="status" aria-live="polite">
        <span className="mono-label text-up">Committed</span>
        <p className="text-sm text-ink-muted">
          <strong className="text-ink">{result.data.deployNote}</strong>{' '}
          {result.data.draft ? '(saved as a draft — hidden in production until you unset draft.) ' : ''}
          <code className="text-xs text-ink-faint">{result.data.path}</code>
        </p>
        {result.data.commitUrl && (
          <a href={result.data.commitUrl} target="_blank" rel="noopener" className="text-sm font-medium text-cyan-deep">
            View commit → watch the deploy
          </a>
        )}
        <button onClick={onReset} className="btn btn-secondary mt-1">Publish another</button>
      </div>
    );
  }
  return (
    <div className="panel p-6" role="alert">
      <p className="mono-label text-down">Not published</p>
      <p className="mt-2 text-sm text-ink-muted">
        {result.networkError ? 'Network error — try again.' : result.data?.error || `Something went wrong (${result.status}).`}
      </p>
      <button onClick={onReset} className="btn btn-secondary mt-3">Back</button>
    </div>
  );
}

/* ── Blog tab ───────────────────────────────────────────────────────────────
   Two-mode intake: "From a link" drafts an ORIGINAL post that cites the source;
   "My own words" keeps your body verbatim and only fills the metadata. Both
   publish via POST /api/admin/blog. Every entry gets its own /blog/… page. */
function emptyPost() {
  return { title: '', description: '', bodyText: '', source: 'authored', sourceUrl: '', tags: '', slug: '', publishedAt: '', draft: false };
}
function BlogTab() {
  const [phase, setPhase] = useState('input'); // input | analyzing | draft | publishing | done
  const [mode, setMode] = useState('source');  // source | own
  const [src, setSrc] = useState({ url: '', text: '' });
  const [draft, setDraft] = useState(emptyPost());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const analyze = async () => {
    setError('');
    if (mode === 'source' && !src.url.trim() && !src.text.trim()) { setError('Paste a URL to draft from, or paste the source text.'); return; }
    if (mode === 'own' && !src.text.trim()) { setError('Paste your post text.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/blog/analyze', { url: src.url.trim(), text: src.text.trim(), mode });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Drafting failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    setDraft({
      title: d.title || '', description: d.description || '', bodyText: d.bodyText || '',
      source: d.source || 'authored', sourceUrl: d.sourceUrl || '',
      tags: (d.tags || []).join(', '), slug: r.data.suggestedSlug || '', publishedAt: '', draft: false,
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => {
    setError('');
    setDraft({ ...emptyPost(), sourceUrl: src.url.trim(), bodyText: src.text.trim() });
    setWarnings([]);
    setPhase('draft');
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !/\.(md|markdown|txt)$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((s) => ({ ...s, bodyText: String(reader.result || '') }));
    reader.readAsText(file);
  };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      title: draft.title, description: draft.description, bodyText: draft.bodyText,
      source: draft.source, sourceUrl: draft.sourceUrl.trim(),
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      slug: draft.slug.trim(), publishedAt: draft.publishedAt.trim(), draft: draft.draft,
    };
    const r = await postJson('/api/admin/blog', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setMode('source'); setSrc({ url: '', text: '' }); setDraft(emptyPost()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex gap-2" role="tablist" aria-label="Draft mode">
          {[['source', 'From a link'], ['own', 'My own words']].map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                mode === k ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">
          {mode === 'source'
            ? 'Paste a link to something you found. It gets fetched and drafted into an original post in your voice — citing the source, never copying it — for you to edit before it publishes.'
            : 'Paste your own post (a LinkedIn or X note). Your words stay verbatim; the AI just fills in a title, excerpt, and tags. Add the original URL to link the card out to it.'}
        </p>

        <Field label={mode === 'source' ? 'Source URL' : 'Original URL'} hint={mode === 'own' ? '(optional — the post you’re linking out to)' : undefined}>
          <input value={src.url} onChange={(e) => setSrc((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" className={inputCls} />
        </Field>
        <Field
          label={mode === 'source' ? 'Or paste the source text' : 'Your post text'}
          hint={mode === 'source' ? '(fallback for paywalled / bot-walled pages)' : undefined}
        >
          <textarea rows={6} value={src.text} onChange={(e) => setSrc((s) => ({ ...s, text: e.target.value }))} className={inputCls} />
        </Field>

        {error && <p className="text-sm text-down" role="alert">{error}</p>}

        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Working…' : mode === 'source' ? 'Draft with AI' : 'Generate fields'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  // draft | publishing
  const syndicated = draft.source !== 'authored';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the post</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>

      <Warnings items={warnings} />

      <Field label={<>Title <Counter value={draft.title} max={100} /></>}>
        <input value={draft.title} onChange={setD('title')} className={inputCls} />
      </Field>

      <Field label={<>Excerpt / meta description <Counter value={draft.description} max={200} /></>}>
        <textarea rows={2} value={draft.description} onChange={setD('description')} className={inputCls} />
      </Field>

      <Field label="Body" hint="(markdown — drag a .md/.txt file onto the box to replace)">
        <textarea
          rows={12}
          value={draft.bodyText}
          onChange={setD('bodyText')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`${inputCls} font-mono ${dragOver ? 'ring-2 ring-accent/60' : ''}`}
        />
      </Field>

      <Field label="Source">
        <select value={draft.source} onChange={setD('source')} className={inputCls}>
          {SOURCES.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </Field>

      <Field label="Original URL" hint={syndicated ? '(required for a syndicated post)' : '(optional)'}>
        <input value={draft.sourceUrl} onChange={setD('sourceUrl')} placeholder="https://www.linkedin.com/posts/…" className={inputCls} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tags" hint="(comma-separated)">
          <input value={draft.tags} onChange={setD('tags')} placeholder="mrp, building-in-public" className={inputCls} />
        </Field>
        <Field label="Slug" hint="(optional — defaults to a slug of the title)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
      </div>

      <Field label="Published at" hint="(optional — defaults to now, ET)">
        <input value={draft.publishedAt} onChange={setD('publishedAt')} placeholder="2026-07-07T14:32:00-04:00" className={inputCls} />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink-muted">
        <input type="checkbox" checked={draft.draft} onChange={setD('draft')} className="h-4 w-4 rounded border-line" />
        Save as draft (commits, but hidden in production until you unset it)
      </label>

      {error && <p className="text-sm text-down" role="alert">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish post'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Tips & Tricks tab ───────────────────────────────────────────────────────
   Same two-mode intake as Blog, but a category (not a source) and no link-out
   URL. Defaults to "My own words" — most tips are Ian's. Publishes via POST
   /api/admin/tips; every tip gets its own /tips/… page. */
function emptyTip() {
  return { title: '', description: '', bodyText: '', category: 'workflow', tags: '', slug: '', publishedAt: '', draft: false };
}
function TipsTab() {
  const [phase, setPhase] = useState('input'); // input | analyzing | draft | publishing | done
  const [mode, setMode] = useState('own');     // own | source
  const [src, setSrc] = useState({ url: '', text: '' });
  const [draft, setDraft] = useState(emptyTip());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const analyze = async () => {
    setError('');
    if (mode === 'source' && !src.url.trim() && !src.text.trim()) { setError('Paste a URL to draft from, or paste the source text.'); return; }
    if (mode === 'own' && !src.text.trim()) { setError('Paste your tip text.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/tips/analyze', { url: src.url.trim(), text: src.text.trim(), mode });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Drafting failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    setDraft({
      title: d.title || '', description: d.description || '', bodyText: d.bodyText || '',
      category: d.category || 'workflow', tags: (d.tags || []).join(', '),
      slug: r.data.suggestedSlug || '', publishedAt: '', draft: false,
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => {
    setError('');
    setDraft({ ...emptyTip(), bodyText: src.text.trim() });
    setWarnings([]);
    setPhase('draft');
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !/\.(md|markdown|txt)$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((s) => ({ ...s, bodyText: String(reader.result || '') }));
    reader.readAsText(file);
  };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      title: draft.title, description: draft.description, bodyText: draft.bodyText, category: draft.category,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      slug: draft.slug.trim(), publishedAt: draft.publishedAt.trim(), draft: draft.draft,
    };
    const r = await postJson('/api/admin/tips', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setMode('own'); setSrc({ url: '', text: '' }); setDraft(emptyTip()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex gap-2" role="tablist" aria-label="Draft mode">
          {[['own', 'My own words'], ['source', 'From a link']].map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                mode === k ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">
          {mode === 'own'
            ? 'Write the tip in your own words. Your text stays verbatim; the AI just fills in a title, excerpt, category, and tags.'
            : 'Paste a link to something you found. It gets fetched and distilled into one actionable tip in your voice — citing the source, never copying it — for you to edit before it publishes.'}
        </p>

        {mode === 'source' && (
          <Field label="Source URL">
            <input value={src.url} onChange={(e) => setSrc((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" className={inputCls} />
          </Field>
        )}
        <Field
          label={mode === 'own' ? 'Your tip text' : 'Or paste the source text'}
          hint={mode === 'source' ? '(fallback for paywalled / bot-walled pages)' : undefined}
        >
          <textarea rows={6} value={src.text} onChange={(e) => setSrc((s) => ({ ...s, text: e.target.value }))} className={inputCls} />
        </Field>

        {error && <p className="text-sm text-down" role="alert">{error}</p>}

        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Working…' : mode === 'own' ? 'Generate fields' : 'Draft with AI'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  // draft | publishing
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the tip</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>

      <Warnings items={warnings} />

      <Field label={<>Title <Counter value={draft.title} max={100} /></>}>
        <input value={draft.title} onChange={setD('title')} className={inputCls} />
      </Field>

      <Field label={<>Excerpt / meta description <Counter value={draft.description} max={200} /></>}>
        <textarea rows={2} value={draft.description} onChange={setD('description')} className={inputCls} />
      </Field>

      <Field label="Body" hint="(markdown — drag a .md/.txt file onto the box to replace)">
        <textarea
          rows={12}
          value={draft.bodyText}
          onChange={setD('bodyText')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`${inputCls} font-mono ${dragOver ? 'ring-2 ring-accent/60' : ''}`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category">
          <select value={draft.category} onChange={setD('category')} className={inputCls}>
            {TIP_CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Tags" hint="(comma-separated)">
          <input value={draft.tags} onChange={setD('tags')} placeholder="ai, cost, safety" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Slug" hint="(optional — defaults to a slug of the title)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
        <Field label="Published at" hint="(optional — defaults to now, ET)">
          <input value={draft.publishedAt} onChange={setD('publishedAt')} placeholder="2026-07-07T14:32:00-04:00" className={inputCls} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink-muted">
        <input type="checkbox" checked={draft.draft} onChange={setD('draft')} className="h-4 w-4 rounded border-line" />
        Save as draft (commits, but hidden in production until you unset it)
      </label>

      {error && <p className="text-sm text-down" role="alert">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish tip'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Signal tab ─────────────────────────────────────────────────────────────
   A curated link + a why-it-matters note. Paste a URL (or the article text) → AI
   drafts a headline + note → review → publish via POST /api/admin/news/publish. */
function emptySignal() {
  return { title: '', url: '', source: '', summary: '', tags: '', image: '', slug: '', pinnedAt: '', pinned: false };
}
function SignalTab() {
  const [phase, setPhase] = useState('input');
  const [src, setSrc] = useState({ url: '', text: '' });
  const [draft, setDraft] = useState(emptySignal());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const analyze = async () => {
    setError('');
    if (!src.url.trim() && !src.text.trim()) { setError('Paste a URL or the article text.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/news/analyze', { url: src.url.trim(), text: src.text.trim() });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Analysis failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    setDraft({
      title: d.title || '', url: d.url || src.url.trim(), source: d.source || '', summary: d.summary || '',
      tags: (d.tags || []).join(', '), image: '', slug: r.data.suggestedSlug || '', pinnedAt: '', pinned: false,
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => {
    setError('');
    setDraft({ ...emptySignal(), url: src.url.trim() });
    setWarnings([]);
    setPhase('draft');
  };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      title: draft.title, url: draft.url.trim(), source: draft.source.trim(), summary: draft.summary,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      image: draft.image.trim(), slug: draft.slug.trim(), pinnedAt: draft.pinnedAt.trim(), pinned: draft.pinned,
    };
    const r = await postJson('/api/admin/news/publish', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setSrc({ url: '', text: '' }); setDraft(emptySignal()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          Paste a link to an article worth keeping. It gets fetched and drafted into a headline plus a
          short note on why it matters — for you to review and edit before it lands on the Signal board.
        </p>
        <Field label="Article URL">
          <input value={src.url} onChange={(e) => setSrc((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" className={inputCls} />
        </Field>
        <Field label="Or paste the article text" hint="(fallback for paywalled / bot-walled pages)">
          <textarea rows={6} value={src.text} onChange={(e) => setSrc((s) => ({ ...s, text: e.target.value }))} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-down" role="alert">{error}</p>}
        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Analyzing…' : 'Draft with AI'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  // draft | publishing
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the entry</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>

      <Warnings items={warnings} />

      <Field label="Article URL" hint="(the link the card opens)">
        <input value={draft.url} onChange={setD('url')} placeholder="https://…" className={inputCls} />
      </Field>
      <Field label={<>Title <Counter value={draft.title} min={6} max={140} /></>}>
        <input value={draft.title} onChange={setD('title')} className={inputCls} />
      </Field>
      <Field label={<>Why it matters <Counter value={draft.summary} min={20} max={600} /></>}>
        <textarea rows={4} value={draft.summary} onChange={setD('summary')} className={inputCls} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Source" hint="(optional — falls back to the URL host)">
          <input value={draft.source} onChange={setD('source')} placeholder="Anthropic" className={inputCls} />
        </Field>
        <Field label="Tags" hint="(comma-separated)">
          <input value={draft.tags} onChange={setD('tags')} placeholder="ai, agents" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Image URL" hint="(optional thumbnail)">
          <input value={draft.image} onChange={setD('image')} placeholder="https://…" className={inputCls} />
        </Field>
        <Field label="Slug" hint="(optional — defaults to a slug of the title)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
      </div>

      <Field label="Pinned at" hint="(optional — defaults to now, ET)">
        <input value={draft.pinnedAt} onChange={setD('pinnedAt')} placeholder="2026-07-07T14:32:00-04:00" className={inputCls} />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink-muted">
        <input type="checkbox" checked={draft.pinned} onChange={setD('pinned')} className="h-4 w-4 rounded border-line" />
        Pin to the top of the board
      </label>

      {error && <p className="text-sm text-down" role="alert">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish to Signal'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Favorites tab ──────────────────────────────────────────────────────────
   A bookmark on the visual board. Paste a URL → AI suggests a title, category,
   note, tags + a favicon → review → publish via POST /api/admin/favorites/publish. */
function emptyFav() {
  return { title: '', url: '', category: 'dev-tools', group: '', description: '', tags: '', favicon: '', order: '0', slug: '' };
}
function FavoritesTab() {
  const [phase, setPhase] = useState('input');
  const [src, setSrc] = useState({ url: '', text: '' });
  const [draft, setDraft] = useState(emptyFav());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target?.type === 'checkbox' ? e.target.checked : e.target.value }));

  const analyze = async () => {
    setError('');
    if (!src.url.trim() && !src.text.trim()) { setError('Paste a URL or the page text.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/favorites/analyze', { url: src.url.trim(), text: src.text.trim() });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Analysis failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    setDraft({
      title: d.title || '', url: d.url || src.url.trim(), category: d.category || 'dev-tools',
      group: d.group || '', description: d.description || '', tags: (d.tags || []).join(', '),
      favicon: d.favicon || '', order: '0', slug: r.data.suggestedSlug || '',
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => {
    setError('');
    setDraft({ ...emptyFav(), url: src.url.trim() });
    setWarnings([]);
    setPhase('draft');
  };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      title: draft.title, url: draft.url.trim(), category: draft.category,
      group: draft.group.trim(), description: draft.description,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      favicon: draft.favicon.trim(), order: Number(draft.order) || 0, slug: draft.slug.trim(),
    };
    const r = await postJson('/api/admin/favorites/publish', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setSrc({ url: '', text: '' }); setDraft(emptyFav()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          Paste a link to a tool, doc, or site worth keeping. It gets fetched and drafted into a board
          entry — a title, a category, and a short note on why it’s a favorite — for you to edit before it lands.
        </p>
        <Field label="Page URL">
          <input value={src.url} onChange={(e) => setSrc((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" className={inputCls} />
        </Field>
        <Field label="Or paste the page text" hint="(fallback for paywalled / bot-walled pages)">
          <textarea rows={5} value={src.text} onChange={(e) => setSrc((s) => ({ ...s, text: e.target.value }))} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-down" role="alert">{error}</p>}
        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Analyzing…' : 'Draft with AI'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  // draft | publishing
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the favorite</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>

      <Warnings items={warnings} />

      <Field label="URL" hint="(the link the card opens)">
        <input value={draft.url} onChange={setD('url')} placeholder="https://…" className={inputCls} />
      </Field>
      <Field label={<>Title <Counter value={draft.title} max={80} /></>}>
        <input value={draft.title} onChange={setD('title')} className={inputCls} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category">
          <select value={draft.category} onChange={setD('category')} className={inputCls}>
            {FAV_CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Group" hint="(optional sub-cluster)">
          <input value={draft.group} onChange={setD('group')} placeholder="e.g. frameworks" className={inputCls} />
        </Field>
      </div>

      <Field label={<>Why it’s a favorite <Counter value={draft.description} max={240} /></>} hint="(optional)">
        <textarea rows={3} value={draft.description} onChange={setD('description')} className={inputCls} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tags" hint="(comma-separated)">
          <input value={draft.tags} onChange={setD('tags')} placeholder="framework" className={inputCls} />
        </Field>
        <Field label="Favicon URL" hint="(optional — auto-suggested)">
          <input value={draft.favicon} onChange={setD('favicon')} placeholder="https://…" className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Order" hint="(sort within the category — lower first)">
          <input type="number" value={draft.order} onChange={setD('order')} className={inputCls} />
        </Field>
        <Field label="Slug" hint="(optional — defaults to a slug of the title)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
      </div>

      {error && <p className="text-sm text-down" role="alert">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish favorite'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Glossary tab ─────────────────────────────────────────────────────────────
   Adds ONE term to the glossary content collection (merged with the bulk JSON at
   build). AI drafts the definition; you can always fill it in by hand. */
function emptyGloss() {
  return { term: '', definition: '', category: 'software', aliases: '', tags: '', slug: '' };
}
function GlossaryTab() {
  const [phase, setPhase] = useState('input');
  const [src, setSrc] = useState({ term: '', url: '', text: '' });
  const [draft, setDraft] = useState(emptyGloss());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));

  const analyze = async () => {
    setError('');
    if (!src.term.trim() && !src.text.trim()) { setError('Enter a term, or paste source text.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/glossary/analyze', { term: src.term.trim(), url: src.url.trim(), text: src.text.trim() });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Analysis failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    setDraft({
      term: d.term || src.term.trim(), definition: d.definition || '', category: d.category || 'software',
      aliases: (d.aliases || []).join(', '), tags: (d.tags || []).join(', '), slug: r.data.suggestedSlug || '',
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => { setError(''); setDraft({ ...emptyGloss(), term: src.term.trim() }); setWarnings([]); setPhase('draft'); };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      term: draft.term.trim(), definition: draft.definition.trim(), category: draft.category,
      aliases: draft.aliases.split(',').map((t) => t.trim()).filter(Boolean),
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      slug: draft.slug.trim(),
    };
    const r = await postJson('/api/admin/glossary/publish', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setSrc({ term: '', url: '', text: '' }); setDraft(emptyGloss()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          Add one term to the glossary. Enter the term and let AI draft a plain, public-safe definition — or
          paste a source to ground it — then edit before it lands. The bulk of the dictionary is authored
          offline; this adds a single entry.
        </p>
        <Field label="Term">
          <input value={src.term} onChange={(e) => setSrc((s) => ({ ...s, term: e.target.value }))} placeholder="e.g. Idempotency" className={inputCls} />
        </Field>
        <Field label="Source URL" hint="(optional — ground the definition in a page)">
          <input value={src.url} onChange={(e) => setSrc((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" className={inputCls} />
        </Field>
        <Field label="Or paste source text" hint="(optional)">
          <textarea rows={4} value={src.text} onChange={(e) => setSrc((s) => ({ ...s, text: e.target.value }))} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-down" role="alert">{error}</p>}
        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Drafting…' : 'Draft with AI'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the term</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>
      <Warnings items={warnings} />
      <Field label={<>Term <Counter value={draft.term} max={80} /></>}>
        <input value={draft.term} onChange={setD('term')} className={inputCls} />
      </Field>
      <Field label={<>Definition <Counter value={draft.definition} max={400} /></>} hint="(1–3 plain sentences)">
        <textarea rows={4} value={draft.definition} onChange={setD('definition')} className={inputCls} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category">
          <select value={draft.category} onChange={setD('category')} className={inputCls}>
            {GLOSSARY_CAT_OPTIONS.map(([k, label]) => (<option key={k} value={k}>{label}</option>))}
          </select>
        </Field>
        <Field label="Slug" hint="(optional — defaults to a slug of the term)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Aliases" hint="(comma-separated — abbreviations/synonyms)">
          <input value={draft.aliases} onChange={setD('aliases')} placeholder="e.g. ML" className={inputCls} />
        </Field>
        <Field label="Tags" hint="(comma-separated)">
          <input value={draft.tags} onChange={setD('tags')} placeholder="fundamentals" className={inputCls} />
        </Field>
      </div>
      {error && <p className="text-sm text-down" role="alert">{error}</p>}
      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish term'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Learn tab ────────────────────────────────────────────────────────────────
   Adds ONE leveled crash-course topic. AI drafts the tagline + three primers;
   you supply the resource links (label | url | note, one per line) — AI never
   writes a URL. */
function emptyLearn() {
  return {
    title: '', category: 'software', tagline: '', related: '',
    b_primer: '', b_res: '', i_primer: '', i_res: '', a_primer: '', a_res: '', slug: '',
  };
}
const LEARN_LEVELS = [
  ['b', 'Beginner'],
  ['i', 'Intermediate'],
  ['a', 'Advanced'],
];
function LearnTab() {
  const [phase, setPhase] = useState('input');
  const [src, setSrc] = useState({ title: '', category: '', notes: '' });
  const [draft, setDraft] = useState(emptyLearn());
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const setD = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));

  const analyze = async () => {
    setError('');
    if (src.title.trim().length < 3) { setError('Enter the topic title to draft.'); return; }
    setPhase('analyzing');
    const r = await postJson('/api/admin/learn/analyze', { title: src.title.trim(), category: src.category.trim(), notes: src.notes.trim() });
    if (r.sessionExpired) { setResult(r); setPhase('done'); return; }
    if (!r.ok) { setError(r.data?.error || 'Analysis failed.'); setPhase('input'); return; }
    const d = r.data.draft;
    const L = d.levels || {};
    setDraft({
      title: d.title || src.title.trim(), category: d.category || 'software', tagline: d.tagline || '', related: '',
      b_primer: L.beginner?.primer || '', b_res: '',
      i_primer: L.intermediate?.primer || '', i_res: '',
      a_primer: L.advanced?.primer || '', a_res: '',
      slug: r.data.suggestedSlug || '',
    });
    setWarnings(r.data.warnings || []);
    setPhase('draft');
  };

  const startManual = () => {
    setError('');
    setDraft({ ...emptyLearn(), title: src.title.trim(), category: src.category.trim() || 'software' });
    setWarnings([]);
    setPhase('draft');
  };

  const publish = async () => {
    setError('');
    setPhase('publishing');
    const payload = {
      title: draft.title.trim(), category: draft.category, tagline: draft.tagline.trim(),
      related: draft.related.split(',').map((t) => t.trim()).filter(Boolean),
      slug: draft.slug.trim(),
      levels: {
        beginner: { primer: draft.b_primer.trim(), resources: draft.b_res },
        intermediate: { primer: draft.i_primer.trim(), resources: draft.i_res },
        advanced: { primer: draft.a_primer.trim(), resources: draft.a_res },
      },
    };
    const r = await postJson('/api/admin/learn/publish', payload);
    if (r.ok || r.sessionExpired) { setResult(r); setPhase('done'); return; }
    setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Publish failed${r.status ? ` (${r.status})` : ''}.`));
    setPhase('draft');
  };

  const reset = () => { setPhase('input'); setSrc({ title: '', category: '', notes: '' }); setDraft(emptyLearn()); setWarnings([]); setError(''); setResult(null); };

  if (phase === 'done') return <Result result={result} onReset={reset} />;

  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed text-ink-muted">
          Add one leveled crash course. AI drafts the tagline and the three primers (beginner / intermediate /
          advanced) from your title; you add the resource links yourself. The bulk of Learn is authored offline.
        </p>
        <Field label="Topic title">
          <input value={src.title} onChange={(e) => setSrc((s) => ({ ...s, title: e.target.value }))} placeholder="e.g. GraphQL from scratch" className={inputCls} />
        </Field>
        <Field label="Category" hint="(optional — AI picks if blank)">
          <select value={src.category} onChange={(e) => setSrc((s) => ({ ...s, category: e.target.value }))} className={inputCls}>
            <option value="">— let AI choose —</option>
            {GLOSSARY_CAT_OPTIONS.map(([k, label]) => (<option key={k} value={k}>{label}</option>))}
          </select>
        </Field>
        <Field label="Notes for the drafter" hint="(optional — angle, scope, what to emphasize)">
          <textarea rows={3} value={src.notes} onChange={(e) => setSrc((s) => ({ ...s, notes: e.target.value }))} className={inputCls} />
        </Field>
        {error && <p className="text-sm text-down" role="alert">{error}</p>}
        <div className="flex items-center gap-4">
          <button onClick={analyze} disabled={phase === 'analyzing'} className="btn btn-primary disabled:opacity-60">
            {phase === 'analyzing' ? 'Drafting…' : 'Draft with AI'}
          </button>
          <button type="button" onClick={startManual} className="text-xs text-cyan-deep">or fill it in manually →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="mono-label text-up">Review the topic</p>
        <button onClick={() => setPhase('input')} className="text-xs text-cyan-deep">← start over</button>
      </div>
      <Warnings items={warnings} />
      <Field label={<>Title <Counter value={draft.title} max={120} /></>}>
        <input value={draft.title} onChange={setD('title')} className={inputCls} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category">
          <select value={draft.category} onChange={setD('category')} className={inputCls}>
            {GLOSSARY_CAT_OPTIONS.map(([k, label]) => (<option key={k} value={k}>{label}</option>))}
          </select>
        </Field>
        <Field label="Slug" hint="(optional — defaults to a slug of the title)">
          <input value={draft.slug} onChange={setD('slug')} placeholder="lowercase-with-hyphens" className={inputCls} />
        </Field>
      </div>
      <Field label={<>Tagline <Counter value={draft.tagline} max={200} /></>} hint="(one line)">
        <input value={draft.tagline} onChange={setD('tagline')} className={inputCls} />
      </Field>
      <Field label="Related glossary terms" hint="(optional — comma-separated slugs, e.g. big-o-notation)">
        <input value={draft.related} onChange={setD('related')} placeholder="term-slug, another-slug" className={inputCls} />
      </Field>

      {LEARN_LEVELS.map(([p, label]) => (
        <div key={p} className="rounded-lg border border-line bg-surface p-4">
          <p className="mono-label mb-3">{label}</p>
          <div className="flex flex-col gap-4">
            <Field label={<>Primer <Counter value={draft[`${p}_primer`]} max={600} /></>}>
              <textarea rows={3} value={draft[`${p}_primer`]} onChange={setD(`${p}_primer`)} className={inputCls} />
            </Field>
            <Field label="Resources" hint="(one per line: label | https://… | optional note)">
              <textarea rows={3} value={draft[`${p}_res`]} onChange={setD(`${p}_res`)} placeholder={'The Rust Book | https://doc.rust-lang.org/book/ | official'} className={inputCls} />
            </Field>
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-down" role="alert">{error}</p>}
      <div className="flex items-center gap-4">
        <button onClick={publish} disabled={phase === 'publishing'} className="btn btn-primary disabled:opacity-60">
          {phase === 'publishing' ? 'Publishing…' : 'Publish topic'}
        </button>
        <span className="text-xs text-ink-faint">Firewall-checked, then committed. Live ~1 min after.</span>
      </div>
    </div>
  );
}

/* ── Résumé tab ──────────────────────────────────────────────────────────────
   NOT a publish flow. Generates the full, employer-named document from the
   private canonical data (Workers KV) and hands it back as a download — nothing
   is committed. Three modes: refresh (best-format résumé), tailor (paste a JD →
   keyword-aligned résumé), cover (paste a JD + optional personal notes → a
   cover letter in the operator's own voice). */
function ResumeTab() {
  const [phase, setPhase] = useState('input'); // input | generating | ready
  const [mode, setMode] = useState('refresh'); // refresh | tailor | cover
  const [docMode, setDocMode] = useState('refresh'); // mode snapshotted at generate time — the ready view/download label the document that was actually generated, even if the tabs move mid-flight
  const [jd, setJd] = useState('');
  const [notes, setNotes] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [copied, setCopied] = useState(''); // '' | 'raw' | 'formatted' | 'plain'

  const generate = async () => {
    setError('');
    if (mode !== 'refresh' && jd.trim().length < 50) {
      setError(mode === 'cover' ? 'Paste the job description to write the letter against.' : 'Paste the job description to tailor against.');
      return;
    }
    setDocMode(mode);
    setPhase('generating');
    const r = await postJson('/api/admin/resume/generate', { mode, jobDescription: jd.trim(), notes: mode === 'cover' ? notes.trim() : '' });
    if (r.sessionExpired) { setSession(r); setPhase('ready'); return; }
    if (!r.ok) { setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Generation failed${r.status ? ` (${r.status})` : ''}.`)); setPhase('input'); return; }
    setMarkdown(r.data.markdown || '');
    setWarnings(r.data.warnings || []);
    setPhase('ready');
  };

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docMode === 'cover' ? 'Ian-Provencher-Cover-Letter.md' : docMode === 'tailor' ? 'Ian-Provencher-Resume-tailored.md' : 'Ian-Provencher-Resume.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const flash = (kind) => { setCopied(kind); setTimeout(() => setCopied(''), 1500); };

  // Raw Markdown — for a text editor, or re-feeding the generator.
  const copy = async () => {
    try { await navigator.clipboard.writeText(markdown); flash('raw'); } catch { /* ignore */ }
  };

  // Both flavours at once: rich text for Docs/Word, stripped plain text for ATS
  // boxes. Reports which one actually landed — on a browser without
  // ClipboardItem it degrades to plain, and the label says so rather than
  // claiming a formatted copy that isn't there.
  const copyRich = async () => {
    try { flash(await copyFormatted(markdown)); } catch { /* ignore */ }
  };

  const reset = () => { setPhase('input'); setMode('refresh'); setDocMode('refresh'); setJd(''); setNotes(''); setMarkdown(''); setWarnings([]); setError(''); setSession(null); };

  if (phase === 'ready' && session) return <Result result={session} onReset={reset} />;

  if (phase === 'ready') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="mono-label text-up">{docMode === 'cover' ? 'Cover letter ready' : 'Résumé ready'}</p>
          <button onClick={reset} className="text-xs text-cyan-deep">← generate another</button>
        </div>
        <p className="text-sm leading-relaxed text-ink-muted">
          {docMode === 'cover'
            ? 'The cover letter, in your voice — private to you, committed nowhere. Read it out loud, tweak, then download.'
            : 'The full, employer-named résumé — private to you, committed nowhere. Review and tweak, then download.'}
        </p>
        <Warnings items={warnings} />
        <textarea rows={20} value={markdown} onChange={(e) => setMarkdown(e.target.value)} className={`${inputCls} font-mono`} />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={download} className="btn btn-primary">Download .md</button>
          <button onClick={copyRich} className="btn btn-secondary">
            {copied === 'formatted' ? 'Copied ✓' : copied === 'plain' ? 'Copied as plain text ✓' : 'Copy as formatted'}
          </button>
          <button onClick={copy} className="btn btn-secondary">{copied === 'raw' ? 'Copied ✓' : 'Copy Markdown'}</button>
        </div>
        <p className="text-xs text-ink-faint">
          <strong className="font-medium text-ink-muted">Copy as formatted</strong> carries both versions at once — rich text
          for Google Docs or Word, clean plain text for ATS “paste your resume” boxes. Each destination takes the one it
          understands, so no “Paste from Markdown” step.
        </p>
      </div>
    );
  }

  // input | generating
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Generate mode">
        {[['refresh', 'Refresh to best format'], ['tailor', 'Tailor to a job'], ['cover', 'Cover letter']].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={mode === k}
            onClick={() => { setMode(k); setError(''); }}
            className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              mode === k ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-ink-muted">
        {mode === 'refresh'
          ? 'Generate a fresh, general-purpose résumé from your private canonical data, formatted to today’s recruiter / ATS best practice.'
          : mode === 'tailor'
            ? 'Paste a job description. The résumé is tailored and keyword-aligned to that role — using only facts from your canonical data.'
            : 'Paste a job description. A cover letter is written in your voice — grounded only in your canonical data, tailored to that role.'}
      </p>

      {mode !== 'refresh' && (
        <Field label="Job description">
          <textarea rows={8} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the role’s job description…" className={inputCls} />
        </Field>
      )}

      {mode === 'cover' && (
        <Field label="Personal notes" hint="optional — a referral, why this role, anything to work in">
          <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Referred by …; what genuinely interests you about this role…" className={inputCls} />
        </Field>
      )}

      {error && <p className="text-sm text-down" role="alert">{error}</p>}

      <div className="flex items-center gap-4">
        <button onClick={generate} disabled={phase === 'generating'} className="btn btn-primary disabled:opacity-60">
          {phase === 'generating' ? 'Generating…' : mode === 'cover' ? 'Generate cover letter' : 'Generate résumé'}
        </button>
        <span className="text-xs text-ink-faint">Private — returned to you, never committed.</span>
      </div>
    </div>
  );
}

/* ── Shared console atoms (DATA / SETUP / RUNBOOK) ───────────────────────────── */

// One call on mount for secret-presence booleans + last refresh run. Shared to
// the Data + Setup groups. Never returns a secret value (see the Worker).
function useStatus() {
  const [status, setStatus] = useState(null); // null = loading
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    postJson('/api/admin/status', {}).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setStatus(r.data);
      else setError(true);
    });
    return () => { live = false; };
  }, []);
  return { status, error };
}

// A collapsible plain-language how-to under a lever.
function Walkthrough({ summary, children }) {
  return (
    <details className="admin-walk mt-3 rounded-lg border border-line bg-surface/40">
      <summary className="px-4 py-2.5 text-sm font-medium text-cyan-deep">{summary}</summary>
      <div className="space-y-2.5 border-t border-line px-4 py-3.5 text-sm leading-relaxed text-ink-muted">
        {children}
      </div>
    </details>
  );
}

// Small ordered how-to list, styled once.
function Steps({ children }) {
  return <ol className="ml-4 list-decimal space-y-1.5 marker:text-ink-faint">{children}</ol>;
}
const Cmd = ({ children }) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-cyan-deep">{children}</code>;

// on: true = configured (green), false = not set (amber), null/undefined = unknown.
function StatusDot({ on }) {
  const cls = on === true ? 'bg-up' : on === false ? 'bg-warn' : 'bg-ink-faint';
  const label = on === true ? 'configured' : on === false ? 'not set' : 'unknown';
  // role="img" makes aria-label valid here — on a generic span it's ignored by most SRs.
  return <span role="img" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} title={label} aria-label={label} />;
}

function SessionExpiredNote() {
  return (
    <p className="mt-3 rounded-lg border border-down/40 bg-down/5 p-3 text-xs text-down" role="alert">
      Your Cloudflare Access session timed out.{' '}
      <button onClick={() => window.location.reload()} className="font-medium underline">Reload to sign in</button>.
    </p>
  );
}

function LastRun({ workflow, label = 'Last refresh run' }) {
  if (!workflow) return null;
  const tone = workflow.conclusion === 'success' ? 'text-up'
    : workflow.conclusion === 'failure' ? 'text-down' : 'text-ink-faint';
  let when = '';
  try { when = workflow.at ? new Date(workflow.at).toLocaleString() : ''; } catch { /* ignore */ }
  return (
    <p className="text-xs text-ink-faint">
      {label}: <span className={tone}>{workflow.conclusion || workflow.status || 'unknown'}</span>
      {when && ` · ${when}`}
      {workflow.url && (<>{' · '}<a href={workflow.url} target="_blank" rel="noopener" className="text-cyan-deep">view →</a></>)}
    </p>
  );
}

/* ── DATA group — on-demand refresh + walkthroughs ───────────────────────────── */

function RefreshCard({ kind, title, what, children }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true); setResult(null);
    const r = await postJson(`/api/admin/refresh/${kind}`, {});
    setBusy(false); setResult(r);
  };
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">{what}</p>
        </div>
        <button onClick={run} disabled={busy} className="btn btn-secondary shrink-0 text-sm disabled:opacity-60">
          {busy ? 'Queuing…' : 'Run now'}
        </button>
      </div>
      {result?.sessionExpired && <SessionExpiredNote />}
      {result?.ok && (
        <p className="mt-3 rounded-lg border border-up/40 bg-up/5 p-3 text-xs text-up" role="status">
          {result.data.deployNote}
        </p>
      )}
      {result && !result.ok && !result.sessionExpired && (
        <p className="mt-3 rounded-lg border border-down/40 bg-down/5 p-3 text-xs text-down" role="alert">
          {result.networkError ? 'Network error — try again.' : result.data?.error || `Something went wrong (${result.status}).`}
        </p>
      )}
      {children}
    </div>
  );
}

function DataGroup({ status }) {
  const workflow = status?.workflow || null;
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        Repos and the job board pull from public APIs — a scheduled action refreshes them daily,
        and you can trigger one right now. Tools, architectures, and cron read from your private
        machine, so those stay a local command (spelled out below).
      </p>
      {workflow && <div className="panel p-4"><LastRun workflow={workflow} /></div>}

      <RefreshCard kind="repos" title="Repositories" what="Re-pulls your public GitHub repos into the gallery.">
        <Walkthrough summary="How this works — and how to run it yourself">
          <p><strong className="text-ink">Run now</strong> fires a GitHub Action that re-fetches your public repos, re-checks the safe-export gate, and commits any change — live in ~2 min.</p>
          <p>To do it from your own machine instead:</p>
          <Steps>
            <li>Open a terminal in the project folder.</li>
            <li>First time only: <Cmd>gh auth login</Cmd> → choose <em>GitHub.com → HTTPS → browser</em>.</li>
            <li>Run <Cmd>npm run fetch:repos</Cmd> — it prints “N public repo(s) written.”</li>
            <li><Cmd>git add -A</Cmd>, <Cmd>git commit -m "repos: refresh"</Cmd>, <Cmd>git push</Cmd>.</li>
          </Steps>
          <p className="text-ink-faint">Curate order/blurbs in <Cmd>scripts/sources/repos-overrides.json</Cmd>.</p>
        </Walkthrough>
      </RefreshCard>

      <RefreshCard kind="jobs" title="Job board" what="Re-pulls and AI-scores fresh listings from Adzuna.">
        <Walkthrough summary="How this works — and how to run it yourself">
          <p><strong className="text-ink">Run now</strong> fires the same action for the job board. It needs the Adzuna keys set in <em>GitHub Actions</em> (see the Setup tab) and, for AI scoring, an Anthropic key.</p>
          <p>From your machine: <Cmd>npm run fetch:jobs</Cmd> → review the diff → commit. Without a total Adzuna outage it never wipes a good board.</p>
        </Walkthrough>
      </RefreshCard>

      <div className="panel p-5">
        <div className="flex items-center gap-3">
          <span className="mono-label shrink-0 rounded bg-surface-2 px-2 py-1 text-ink-faint">local only</span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Tools · Architectures · Cron</h3>
            <p className="mt-0.5 text-xs text-ink-faint">Exported from your private Command Center OS + Hermes — the cloud can’t reach those, so there’s no button.</p>
          </div>
        </div>
        <Walkthrough summary="How to refresh these (needs your machine)">
          <Steps>
            <li>Open a terminal in the project folder.</li>
            <li>Run <Cmd>npm run export</Cmd> — it reads your private files and rewrites the public-safe snapshots.</li>
            <li><strong className="text-ink">Review the git diff</strong> of <Cmd>src/data/*.generated.json</Cmd> — this is the moment to catch anything that shouldn’t go out.</li>
            <li><Cmd>git add -A</Cmd>, <Cmd>git commit</Cmd>, <Cmd>git push</Cmd>.</li>
          </Steps>
          <p className="text-ink-faint">To publish a new tool/architecture, add its id to <Cmd>scripts/publish-manifest.json</Cmd> first, then export.</p>
        </Walkthrough>
      </div>
    </div>
  );
}

/* ── SETUP group — which keys are set, and how to set them ────────────────────── */

const SETUP_ITEMS = [
  {
    key: 'ANTHROPIC_API_KEY', where: 'Cloudflare Worker secret',
    powers: 'AI drafting (Blog / Tips / Signal / Favorites / Glossary / Learn) and the résumé + cover-letter generator. Without it those fall back to manual fill. NOTE: job scoring does NOT use this key — it runs in GitHub Actions and has its own (see the Data tab).',
    steps: (
      <Steps>
        <li>Cloudflare dashboard → <strong className="text-ink">Workers &amp; Pages</strong> → the <Cmd>ian-provencher</Cmd> Worker.</li>
        <li><strong className="text-ink">Settings → Variables and Secrets → Add</strong> → type <em>Secret</em>.</li>
        <li>Name <Cmd>ANTHROPIC_API_KEY</Cmd>, paste the key, <strong className="text-ink">Deploy</strong>. Set a monthly spend cap on the key.</li>
        <li>Use the dedicated key named <Cmd>ian-provencher-worker</Cmd> — one key per application, so spend is attributable and any single key can be capped or revoked on its own.</li>
      </Steps>
    ),
  },
  {
    key: 'RESUME_KV (key: full)', where: 'Workers KV',
    powers: 'The private résumé + cover-letter generator — your real, employer-named canonical career data. KV is the sole source (the old RESUME_FULL secret is retired; it survives only as a local-dev fallback).',
    steps: (
      <Steps>
        <li>Edit the canonical locally, then load it: <Cmd>wrangler kv key put --binding RESUME_KV full --path &lt;file&gt; --remote</Cmd>.</li>
        <li>It’s never committed or scanned — that’s the one firewall carve-out. Keep the generator-guidance lines in the data; every mode obeys them.</li>
      </Steps>
    ),
  },
  {
    key: 'GITHUB_TOKEN', where: 'Cloudflare Worker secret',
    powers: 'Publishing from this console AND the Data-tab “Run now” buttons. For Run now it needs Actions:read+write added to the token’s scopes (Contents alone 403s).',
    steps: (
      <Steps>
        <li>GitHub → <strong className="text-ink">Settings → Developer settings → Fine-grained tokens</strong> → edit the token → add <em>Actions: Read and write</em> alongside Contents.</li>
        <li>Set it as the Worker secret <Cmd>GITHUB_TOKEN</Cmd> (same Add → Secret flow).</li>
      </Steps>
    ),
  },
  {
    key: 'FIREWALL_LITERALS', where: 'Cloudflare Worker secret (optional)',
    powers: 'Restores your local exact-literals check on the console’s direct-commit path (mirrors scripts/denylist.local.json). Defense-in-depth — the generic regexes cover the rest.',
    steps: (
      <Steps>
        <li>Optional. Set the Worker secret <Cmd>FIREWALL_LITERALS</Cmd> to the same newline- or comma-separated literals as your local <Cmd>denylist.local.json</Cmd>.</li>
      </Steps>
    ),
  },
  {
    key: 'ACCESS_ALLOWED_EMAIL', where: 'Cloudflare Worker var (optional)',
    powers: 'A second lock: even a signature-valid Access token can’t write unless the email matches. The live Access login already proves the gate works, so this is safe to enforce.',
    steps: (
      <Steps>
        <li>Set the Worker var <Cmd>ACCESS_ALLOWED_EMAIL</Cmd> to your Access login email (already enforced in wrangler.jsonc vars).</li>
      </Steps>
    ),
  },
];

function SetupGroup({ status, statusError }) {
  const secrets = status?.secrets || null;
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        The dots show which keys the Worker can see right now — <span className="text-up">green</span> = set,
        <span className="text-warn"> amber</span> = not set. Values are never shown, only presence.
      </p>
      {statusError && (
        <p className="rounded-lg border border-down/40 bg-down/5 p-3 text-xs text-down">
          Couldn’t read status — reload after signing in to Access.
        </p>
      )}

      <div className="space-y-4">
        {SETUP_ITEMS.map((it) => (
          <div key={it.key} className="panel p-5">
            <div className="flex items-center gap-3">
              <StatusDot on={secrets ? !!secrets[it.key] : null} />
              <div>
                <h3 className="font-mono text-sm font-semibold text-ink">{it.key}</h3>
                <p className="text-xs text-ink-faint">{it.where}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{it.powers}</p>
            <Walkthrough summary="How to set it">{it.steps}</Walkthrough>
          </div>
        ))}

        {/* Adzuna lives in GitHub Actions, not the Worker — no dot to read here. */}
        <div className="panel p-5">
          <div className="flex items-center gap-3">
            <span className="mono-label shrink-0 rounded bg-surface-2 px-2 py-1 text-ink-faint">GitHub Actions</span>
            <div>
              <h3 className="font-mono text-sm font-semibold text-ink">ADZUNA_APP_ID / ADZUNA_APP_KEY</h3>
              <p className="text-xs text-ink-faint">GitHub Actions repo secrets — powers the scheduled job pull</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            These live with the Action, not the Worker, so there’s no live dot for them — check the last refresh run on the Data tab.
          </p>
          <Walkthrough summary="How to set them">
            <Steps>
              <li>Free account at <a href="https://developer.adzuna.com" target="_blank" rel="noopener" className="text-cyan-deep underline">developer.adzuna.com</a> → get an <em>app_id</em> and <em>app_key</em>.</li>
              <li>GitHub → repo → <strong className="text-ink">Settings → Secrets and variables → Actions → New repository secret</strong>.</li>
              <li>Add <Cmd>ADZUNA_APP_ID</Cmd> and <Cmd>ADZUNA_APP_KEY</Cmd>.</li>
              <li>For AI fit-scoring, also add <Cmd>ANTHROPIC_API_KEY</Cmd> here — but use a <strong className="text-ink">separate key</strong> from the Worker&rsquo;s, named <Cmd>ian-provencher-jobs-ci</Cmd>. This is a different key store on a different trust boundary, and it is the only unattended spender: the Action runs daily and scores up to 80 batches per run. Without it, scoring silently falls back to a keyword heuristic and the run still goes green.</li>
            </Steps>
          </Walkthrough>
        </div>
      </div>
    </div>
  );
}

/* ── RUNBOOK group — every manual lever in one place ─────────────────────────── */

const LEVERS = [
  { lever: 'Publish a blog post, tip, signal, or favorite', where: 'This console → Content', how: 'Paste a link or write it, review the draft, Publish. Commits + deploys in ~1 min.' },
  { lever: 'Generate your résumé or a cover letter (tailored to a JD)', where: 'This console → Content → Résumé', how: 'Downloads the file. Private — never committed.' },
  { lever: 'Refresh repos or the job board', where: 'This console → Data (Run now)', how: 'Or npm run fetch:repos / fetch:jobs on your machine, then commit.' },
  { lever: 'Refresh tools, architectures, or cron', where: 'Your machine', how: 'npm run export → review the git diff → commit. Needs your private files.' },
  { lever: 'Add a whole new section', where: 'Your machine (or ask Claude Code)', how: 'One entry in src/data/sections.ts → nav chip + landing card + stub for free.' },
  { lever: 'Publish a new tool or architecture', where: 'Your machine', how: 'Add its id to scripts/publish-manifest.json, then npm run export.' },
  { lever: 'Regenerate OG cards + favicons', where: 'Your machine', how: 'npm run assets after brand or card-copy changes.' },
  { lever: 'Check nothing private leaks', where: 'Your machine / CI', how: 'npm run gate — the safe-export firewall. Also runs automatically on every deploy.' },
];

function RunbookGroup() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Every lever you have, and where it lives. The console handles the content and the API-driven
        data; anything reading your private machine stays a local command.
      </p>
      <div className="overflow-hidden rounded-xl border border-line">
        {LEVERS.map((l, i) => (
          <div key={i} className={`grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[1.4fr_1fr] sm:gap-4 ${i > 0 ? 'border-t border-line' : ''}`}>
            <div>
              <p className="text-sm font-medium text-ink">{l.lever}</p>
              <p className="mt-0.5 text-xs text-cyan-deep">{l.where}</p>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">{l.how}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── CONTENT group — the existing 5 publish tabs, unchanged ───────────────────── */

function ContentGroup({ tab, setTab }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Publish to">
        {[['blog', 'Blog post'], ['tips', 'Tip'], ['news', 'Signal'], ['favorites', 'Favorite'], ['glossary', 'Glossary'], ['learn', 'Learn'], ['resume', 'Résumé']].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === k ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'blog' && <BlogTab />}
      {tab === 'tips' && <TipsTab />}
      {tab === 'news' && <SignalTab />}
      {tab === 'favorites' && <FavoritesTab />}
      {tab === 'glossary' && <GlossaryTab />}
      {tab === 'learn' && <LearnTab />}
      {tab === 'resume' && <ResumeTab />}
    </div>
  );
}

/* ── The console shell — four groups down the left, panel on the right ────────── */

const GROUPS = [
  ['content', 'Content', 'Publish posts, tips, links; generate your résumé + cover letters'],
  ['data', 'Data', 'Refresh repos + jobs; how to refresh the rest'],
  ['setup', 'Setup', 'Which keys are set, and how to set them'],
  ['runbook', 'Runbook', 'Every manual lever, in one place'],
];

export default function AdminConsole() {
  const [group, setGroup] = useState('content');
  const [tab, setTab] = useState('blog');
  const { status, error } = useStatus();
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <nav className="shrink-0 lg:w-56" aria-label="Console sections">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {GROUPS.map(([k, label, desc]) => (
            <li key={k} className="shrink-0 lg:shrink">
              <button
                onClick={() => setGroup(k)}
                aria-current={group === k ? 'page' : undefined}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  group === k ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-line-2'
                }`}
              >
                <span className={`block text-sm font-medium ${group === k ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
                <span className="mt-0.5 hidden text-xs leading-snug text-ink-faint lg:block">{desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        {group === 'content' && <ContentGroup tab={tab} setTab={setTab} />}
        {group === 'data' && <DataGroup status={status} />}
        {group === 'setup' && <SetupGroup status={status} statusError={error} />}
        {group === 'runbook' && <RunbookGroup />}
      </div>
    </div>
  );
}
