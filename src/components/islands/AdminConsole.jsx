import { useState, useEffect } from 'react';
import { copyFormatted, mdToPlain } from '../../lib/md-clipboard.js';
import { mdToDocx, printHtml, printPage, keywordCoverage } from '../../lib/draft-export.js';
import { WHOLE_POSTING_FROM, trustedSite } from '../../lib/posting-from.js';

/* ============================================================================
   AdminConsole — the private owner console (mounted on /admin). It opens on Jobs:
   the paste scorer and the private job desk (/api/admin/desk, D93, D103), and the
   Writer, which writes a résumé, cover letter, Upwork proposal or LinkedIn post and
   saves every version privately (/api/admin/resume/generate). Content holds the
   publish tabs (each an AI-assisted fetch → review → publish flow, e.g. Blog →
   /api/admin/blog/analyze → /api/admin/blog). Every group and tab mounts the first
   time it is opened and then stays mounted, hidden, so nothing typed is lost on a switch.
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
    // An expired Access session answers with its sign-in page; anything else non-JSON is a fault,
    // and calling every one of them "session expired" sent him to sign in again for nothing.
    let access = res.redirected && /cloudflareaccess\.com/i.test(res.url || '');
    if (!access && res.status === 200) { try { access = /cloudflareaccess|CF_Authorization|Cloudflare Access/i.test(await res.text()); } catch { /* unreadable */ } }
    if (access) return { sessionExpired: true, status: res.status };
    return { unexpected: true, status: res.status, data: { error: `The server sent an unexpected reply (${res.status}). Try again; if it repeats, reload the page.` } };
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

/* ── The document editor (D93) ───────────────────────────────────────────────
   One editor for every generated document — a résumé, letter, Upwork proposal or
   LinkedIn post, on a desk job or on its own. Every result the Worker writes is
   saved as a version in private KV (never the repo), so Undo walks back through
   versions, Save keeps a hand edit, and History counts them. Revise edits the
   draft on screen (hand edits included); Regenerate starts over with the
   instruction folded into the direction. */
const NOUN = { resume: 'Résumé', cover: 'Cover letter', upwork: 'Upwork proposal', linkedin: 'LinkedIn post' };
const FILE_BASE = { resume: 'Ian-Provencher-Resume', cover: 'Ian-Provencher-Cover-Letter', upwork: 'Upwork-Proposal', linkedin: 'LinkedIn-Post' };
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* The writer's reading of the posting (D113), saved with each résumé version: the dial between AI and
   supply-chain work, the posting's terms the draft carries, and each must-have with its evidence or gap. */
function FitPanel({ analysis, markdown }) {
  if (!analysis) return null;
  const w = analysis.aiWeight;
  const { found, missing } = keywordCoverage(analysis.keywords, markdown);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/60 p-3 text-sm">
      <p className="mono-label text-ink-faint">How the writer read this posting</p>
      {(analysis.roleKind || analysis.level) && <p className="text-ink">{[analysis.roleKind, analysis.level].filter(Boolean).join(' · ')}</p>}
      {w != null && (
        <div title="How much of this role is AI work against supply-chain work, read from its duties. It decides which half leads. Type a dial in Direction (for example “dial 80”) to set it yourself.">
          <div className="flex justify-between font-mono text-xs text-ink-muted"><span>AI {w}</span><span>Supply chain {100 - w}</span></div>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-line">
            <div className="bg-accent" style={{ width: `${w}%` }} />
          </div>
        </div>
      )}
      {analysis.keywords.length > 0 && (
        <p className="text-ink-muted" title="Applicant-tracking systems match the posting's own words. A term left out may be one the knowledge base cannot prove; the must-haves below say which.">
          {found.length} of {analysis.keywords.length} of the posting’s terms are in the draft.
          {missing.length > 0 && <span className="text-warn"> Not in it: {missing.join(', ')}.</span>}
        </p>
      )}
      {analysis.evidence.length > 0 && (
        <ul className="flex flex-col gap-1 text-ink-muted">
          {analysis.evidence.map((e, i) => (
            <li key={i}>
              <span className="text-ink">{e.requirement}</span>
              {e.entries.length > 0 && <span className="font-mono text-xs"> — {e.entries.join(', ')}</span>}
              {e.gap && <span className="text-warn"> — gap: {e.gap}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocEditor({ kind, jobKey = '', docId: firstDocId = null, versions: firstVersions = [], jobDescription = '', notes = '', direction = '', warnings: firstWarnings = [], meta: firstMeta = null, testEffort = {}, onSession, onBusyChange }) {
  const [versions, setVersions] = useState(firstVersions);
  const [idx, setIdx] = useState(firstVersions.length - 1);
  const [markdown, setMarkdown] = useState(firstVersions[firstVersions.length - 1]?.markdown || '');
  const [docId, setDocId] = useState(firstDocId);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState('');
  const [warnings, setWarnings] = useState(firstWarnings);
  const [meta, setMeta] = useState(firstMeta);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [undoArmed, setUndoArmed] = useState(false);
  const edited = markdown !== (versions[idx]?.markdown || '');
  useEffect(() => { onBusyChange?.(!!busy); }, [busy]);
  useEffect(() => { setUndoArmed(false); }, [markdown, idx]);

  const redraft = async (how) => {
    if (!instruction.trim() || busy) return;
    setError('');
    setBusy(how);
    const r = await postJson('/api/admin/resume/generate', {
      kind, jobDescription, notes: kind === 'cover' ? notes : '', jobKey, docId,
      direction: how === 'regenerate' ? [direction, instruction.trim()].filter(Boolean).join('\n\n') : direction,
      ...(how === 'revise' ? { draft: markdown, instruction: instruction.trim() } : {}),
      ...testEffort,
    });
    setBusy('');
    if (r.sessionExpired) { onSession?.(r); return; }
    if (!r.ok) { setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Redraft failed${r.status ? ` (${r.status})` : ''}.`)); return; }
    // The desk keeps only its newest versions, so the list here is cut to the count it reports.
    const next = [...versions, { at: new Date().toISOString(), by: how, markdown: r.data.markdown || '', analysis: r.data.analysis || null }].slice(-(r.data.versions || Infinity));
    setVersions(next);
    setIdx(next.length - 1);
    setMarkdown(r.data.markdown || '');
    setWarnings(r.data.warnings || []);
    setMeta(r.data.meta || null);
    if (r.data.docId) setDocId(r.data.docId);
    setInstruction('');
  };
  const undo = () => {
    if (idx <= 0) return;
    // Undo used to drop unsaved hand edits without a word. Now the first press says so.
    if (edited && !undoArmed) { setUndoArmed(true); return; }
    setUndoArmed(false);
    setIdx(idx - 1);
    setMarkdown(versions[idx - 1].markdown);
    setWarnings([]);
  };
  const save = async () => {
    if (!docId || !edited || busy) return;
    setBusy('save');
    const r = await postJson('/api/admin/desk', { action: 'save-doc', docId, markdown });
    setBusy('');
    if (r.sessionExpired) { onSession?.(r); return; }
    if (!r.ok) { setError(r.data?.error || 'Not saved — try again.'); return; }
    const next = [...versions, { at: new Date().toISOString(), by: 'edit', markdown, analysis: versions[idx]?.analysis || null }].slice(-(r.data.versions || Infinity));
    setVersions(next);
    setIdx(next.length - 1);
  };
  const saveFile = (data, type, ext) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${FILE_BASE[kind] || 'document'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = () => saveFile(markdown, 'text/markdown;charset=utf-8', 'md');
  const plainFile = () => saveFile(mdToPlain(markdown), 'text/plain;charset=utf-8', 'txt');
  // The Word file and the print page refuse a draft they cannot render faithfully, and say which line.
  const wordFile = () => {
    setError('');
    try { saveFile(mdToDocx(markdown, { kind, title: `${NOUN[kind]}, Ian Provencher`, author: 'Ian Provencher' }), DOCX_TYPE, 'docx'); }
    catch (e) { setError(`No Word file made. ${e.message}`); }
  };
  const printPdf = () => {
    setError('');
    let html;
    try { html = printHtml(markdown, { kind, title: FILE_BASE[kind] }); } catch (e) { setError(`Nothing printed. ${e.message}`); return; }
    printInFrame(html);
  };
  const flash = (k) => { setCopied(k); setTimeout(() => setCopied(''), 1500); };
  const copyFailed = () => setError('Copy failed: the browser blocked the clipboard. Select the text above and copy it by hand.');
  const copy = async () => { try { await navigator.clipboard.writeText(markdown); flash('raw'); } catch { copyFailed(); } };
  const copyRich = async () => { try { flash(await copyFormatted(markdown)); } catch { copyFailed(); } };
  const v = versions[idx];
  const paper = kind === 'resume' || kind === 'cover';

  return (
    <div className="flex flex-col gap-3">
      <Warnings items={warnings} />
      {kind === 'resume' && <FitPanel analysis={v?.analysis} markdown={markdown} />}
      <p className="font-mono text-xs text-ink-faint" title="Which version is on screen, who wrote it, and what it cost">
        Version {idx + 1} of {versions.length}
        {v?.by ? ` · ${v.by === 'overnight' ? 'drafted overnight' : v.by === 'edit' ? 'your edit' : v.by === 'revise' ? 'revised' : v.by === 'regenerate' ? 'regenerated' : 'written'}` : ''}
        {v?.fromSummary ? ' · drafted from a summary' : ''}
        {meta?.model ? ` · ${meta.model} at ${meta.effort}` : ''}
        {meta?.cost ? ` · $${meta.cost.toFixed(2)}` : ''}
        {edited ? ' · unsaved edits' : ''}
      </p>
      <textarea rows={16} value={markdown} onChange={(e) => setMarkdown(e.target.value)} className={`${inputCls} font-mono`} title="Edit freely; Save keeps your edit as a new version" />
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/60 p-3">
        <Field label="Adjust it" hint="a change, a tone, an angle">
          <textarea rows={2} maxLength={2000} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. shorter; lead with the inventory work; warmer opener…" className={inputCls} title="What to change: Revise applies it to the draft above, Regenerate starts over with it" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => redraft('revise')} disabled={!instruction.trim() || !!busy} className="btn btn-primary disabled:opacity-50" title="Edits the draft above, keeping everything else, your own edits included">
            {busy === 'revise' ? 'Revising…' : 'Revise'}
          </button>
          <button onClick={() => redraft('regenerate')} disabled={!instruction.trim() || !!busy} className="btn btn-secondary disabled:opacity-50" title="Writes a new one from scratch with this added to the direction">
            {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button onClick={undo} disabled={idx <= 0 || !!busy} className="btn btn-secondary disabled:opacity-50" title={idx > 0 ? `Goes back to version ${idx}` : 'Nothing earlier to go back to'}>Undo</button>
          <button onClick={save} disabled={!docId || !edited || !!busy} className="btn btn-secondary disabled:opacity-50" title={docId ? 'Keeps your edit as a new saved version' : 'Saving needs the desk storage connected'}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <span className="text-xs text-ink-faint" title="Every version is kept privately, never in the repo">History {versions.length}</span>
        </div>
        {undoArmed && <p className="text-xs text-warn" role="status">Undo would drop your unsaved edits. Press Undo again to drop them, or Save first.</p>}
      </div>
      {error && <p className="text-sm text-down" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {paper && <button onClick={wordFile} className="btn btn-primary" title={`Saves ${FILE_BASE[kind]}.docx: one column, standard headings, real bullets, Letter paper — the form applicant-tracking systems read best`}>Word file</button>}
        {paper && <button onClick={printPdf} className="btn btn-secondary" title="Opens the print dialog on the page as it will look; choose “Save as PDF” there for a PDF">Print or save as PDF</button>}
        <button onClick={plainFile} className="btn btn-secondary" title={`Saves ${FILE_BASE[kind]}.txt with the Markdown marks taken out, for a site's paste-your-résumé box`}>Plain text file</button>
        <button onClick={copyRich} className="btn btn-secondary" title="Rich text for Docs or Word, plain text for job-site boxes, in one copy">
          {copied === 'formatted' ? 'Copied ✓' : copied === 'plain' ? 'Copied as plain text ✓' : 'Copy as formatted'}
        </button>
        <button onClick={copy} className="btn btn-secondary" title="The raw Markdown">{copied === 'raw' ? 'Copied ✓' : 'Copy Markdown'}</button>
        <button onClick={download} className="btn btn-secondary" title={`Saves ${FILE_BASE[kind]}.md to your computer`}>Download .md</button>
      </div>
    </div>
  );
}

/* ── Jobs group (D93): the private job desk ──────────────────────────────────
   His pick on 2026-10-08 (shape pack, arrangement 1): the list on the left,
   sorted by fit, with the open job's file beside it. Everything here is private:
   the public board never reads a status from the desk. The hourly run files new
   board rows; Preview tonight lists what it would draft and spends nothing. */
const DESK_STATUS = { new: 'New', drafted: 'Drafts ready', applied: 'Applied', closed: 'Closed' };
const DESK_DOT = { new: 'bg-warn', drafted: 'bg-accent', applied: 'bg-up', closed: 'bg-line' };
const WORK_SAYS = {
  queued: 'queued for the next run',
  sent: 'in tonight’s batch — back within the hour',
  done: 'done',
  declined: 'the model declined this one',
  'ran out of room': 'ran out of room — redo it',
  'no document': 'came back empty — redo it',
  'no brief': 'came back empty — redo it',
  'search paused': 'the search paused — redo it',
};
const workSays = (w, job) => (w != null ? WORK_SAYS[w] || w
  : job?.confirmed === false ? 'not queued (not confirmed at the employer)' : 'not queued (fit under the drafting floor)');

// The desk's three settings beside the overnight switch. The bounds come from the desk's own answer,
// and each value shown is the one the desk saved, so a value it moved to a bound shows as moved.
// Only the two kinds the overnight run drafts: nothing reads a direction stored for any other kind.
const DOC_KINDS = [['resume', 'Résumé'], ['cover', 'Cover letter']];
function DeskSettings({ cfg, limits, busy, onSave }) {
  const fromCfg = () => ({ score: String(cfg.minScore ?? ''), cap: String(cfg.capUsd ?? ''), angle: { ...(cfg.angle || {}) } });
  const [form, setForm] = useState(fromCfg);
  const [said, setSaid] = useState('');
  const saved = JSON.stringify(cfg);
  useEffect(() => { setForm(fromCfg()); }, [saved]);
  const [sLo, sHi] = limits?.minScore || [];
  const [cLo, cHi] = limits?.capUsd || [];
  const save = async () => {
    const d = await onSave({ minScore: Number(form.score), capUsd: Number(form.cap), angle: form.angle });
    if (d) setSaid((d.warnings || []).join(' ') || 'Saved.');
  };
  return (
    <details className="panel p-3 text-xs" data-desk="settings">
      <summary className="cursor-pointer font-medium text-ink" title="The score that starts overnight drafts, the month's spending cap, and a standing direction for each kind of document">
        Desk settings: drafts at <span className="font-mono">{cfg.minScore}</span>+ · cap <span className="font-mono">${cfg.capUsd}</span> a month
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Draft at score</span>
          <input type="number" min={sLo} max={sHi} step="1" value={form.score} data-desk="set-score"
            title={`Overnight drafting writes a résumé and a letter only for a job confirmed at its employer that scores at least this (${sLo} to ${sHi})`}
            onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} className={`${inputCls} w-24 font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Monthly cap ($)</span>
          <input type="number" min={cLo} max={cHi} step="1" value={form.cap} data-desk="set-cap"
            title={`The desk stops sending batches once this month's spend would pass this ($${cLo} to $${cHi}; the top is the Anthropic workspace's own monthly limit)`}
            onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))} className={`${inputCls} w-24 font-mono`} />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {DOC_KINDS.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-ink-muted">Standing direction: {label}</span>
            <textarea rows={2} value={form.angle[k] || ''} data-desk={`set-angle-${k}`}
              title={`Sent as your direction with every ${label.toLowerCase()} the overnight run drafts, until you clear it; it steers tone and emphasis and never adds a fact`}
              onChange={(e) => setForm((f) => ({ ...f, angle: { ...f.angle, [k]: e.target.value } }))} className={inputCls} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={!!busy} data-desk="save-settings" className="btn btn-secondary disabled:opacity-50"
          title="Saves all three settings; the boxes then show what the desk saved">
          {busy === 'settings' ? 'Saving…' : 'Save settings'}
        </button>
        {said && <span className="text-ink-muted" role="status" data-desk="settings-said">{said}</span>}
      </div>
    </details>
  );
}

function JobsGroup({ onOpenInWriter, testEffort, active = true }) {
  const [desk, setDesk] = useState(null);
  const [problem, setProblem] = useState('');
  const [filter, setFilter] = useState('open');
  const [sel, setSel] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [session, setSession] = useState(null);

  const load = async () => {
    const r = await postJson('/api/admin/desk', { action: 'list' });
    if (r.sessionExpired) { setSession(r); return; }
    if (!r.ok) { setProblem(r.data?.error || (r.networkError ? 'Network error — reload to try again.' : `The desk did not answer (${r.status}).`)); return; }
    setProblem('');
    setDesk(r.data);
  };
  // Reloaded each time the desk comes back into view: it stays mounted while the Writer is open,
  // and a document written there may have landed in a job file.
  useEffect(() => { if (active) load(); }, [active]);

  const jobs = (desk?.jobs || []).slice().sort((a, b) => (b.s || 0) - (a.s || 0));
  const count = (st) => jobs.filter((j) => (st === 'open' ? j.st !== 'closed' : j.st === st)).length;
  const shown = jobs.filter((j) => (filter === 'open' ? j.st !== 'closed' : j.st === filter));
  const current = sel || shown[0]?.key || null;

  useEffect(() => {
    if (!current) { setFile(null); return; }
    let live = true;
    (async () => {
      const r = await postJson('/api/admin/desk', { action: 'get', key: current });
      if (!live) return;
      if (r.sessionExpired) { setSession(r); return; }
      setFile(r.ok ? r.data : { error: r.data?.error || 'Could not open this job.' });
    })();
    return () => { live = false; };
  }, [current, desk]);

  const act = async (payload, label) => {
    setBusy(label);
    const r = await postJson('/api/admin/desk', payload);
    setBusy('');
    if (r.sessionExpired) { setSession(r); return null; }
    if (!r.ok) { setNote({ error: r.data?.error || 'That did not work — try again.' }); return null; }
    return r.data;
  };
  // A one-job write sets its row from the desk's answer rather than re-reading the list, because the
  // list lags a write by about a minute: seven stored verdicts once counted as one.
  const settle = (d) => {
    if (d?.entry) setDesk((x) => x && { ...x, jobs: [...x.jobs.filter((j) => j.key !== d.entry.key), d.entry] });
    return d;
  };
  const setStatus = async (status) => { settle(await act({ action: 'status', key: current, status }, status)); };
  const redo = async (kind) => { settle(await act({ action: 'redo', key: current, kind }, `redo-${kind}`)); };
  const verdict = async (kind, reason) => { settle(await act({ action: 'verdict', key: current, kind, reason }, `verdict-${kind}`)); };
  const tick = async (dryRun) => {
    const d = await act({ action: 'tick', dryRun }, dryRun ? 'preview' : 'run');
    // ponytail: a run rewrites many rows, so it re-reads the list and can show the old rows for about
    // a minute; the upgrade is for the run to answer with the rows it wrote, as one-job writes do.
    if (d) { setNote(d.log); load(); }
  };
  // A setting is shown from the desk's own answer, so the console shows what was saved.
  const saveConfig = async (payload, label) => {
    const d = await act({ action: 'config', ...payload }, label);
    if (d?.config) setDesk((x) => x && { ...x, config: d.config });
    return d;
  };
  const toggleDrafting = () => saveConfig({ autoDraft: !desk?.config?.autoDraft }, 'config');

  if (session) return <Result result={session} onReset={() => window.location.reload()} />;
  if (problem) return <div className="panel p-5"><p className="text-sm text-down" role="alert">{problem}</p></div>;
  if (!desk) return <p className="text-sm text-ink-faint">Opening the desk…</p>;

  const cfg = desk.config || {};
  const chip = (k, label) => (
    <button key={k} onClick={() => { setFilter(k); setSel(null); }} aria-pressed={filter === k}
      title={k === 'open' ? 'Every job you have not closed' : `Only jobs marked ${label}`}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${filter === k ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'}`}>
      {label} <span className="font-mono">{count(k)}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <ScorePanel onOpenInWriter={onOpenInWriter} onAdded={(d) => { settle(d); setSel(d.key); setFilter('open'); }} onSession={setSession} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg font-semibold text-ink">Jobs</h2>
        {chip('open', 'Open')}{chip('drafted', 'Drafts ready')}{chip('new', 'New')}{chip('applied', 'Applied')}{chip('closed', 'Closed')}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-ink-muted" title="Briefs and drafts this month, priced from the API's own usage figures; the desk stops sending at the limit">
          ${Number(desk.spent || 0).toFixed(2)} of ${cfg.capUsd} this month
        </span>
        <button onClick={toggleDrafting} disabled={!!busy} className="btn btn-secondary disabled:opacity-50"
          title={cfg.autoDraft ? 'The hourly run drafts strong matches; press to stop it' : 'The hourly run only files jobs; press to let it draft strong matches too'}>
          Overnight drafting: {cfg.autoDraft ? 'on' : 'off'}
        </button>
        <button onClick={() => tick(true)} disabled={!!busy} className="btn btn-secondary disabled:opacity-50" title="Lists what the next run would draft and what it would cost; spends nothing">
          {busy === 'preview' ? 'Previewing…' : 'Preview tonight'}
        </button>
        <button onClick={() => tick(false)} disabled={!!busy} className="btn btn-primary disabled:opacity-50" title="Runs the hourly job now: files new board rows and sends one batch">
          {busy === 'run' ? 'Running…' : 'Run now'}
        </button>
        {desk.last?.at && <span className="text-ink-faint" title={[desk.last.intake, desk.last.submit, desk.last.collect, desk.last.lessons && `lessons: ${desk.last.lessons}`, desk.last.error].filter(Boolean).join(' · ')}>Last run {new Date(desk.last.at).toLocaleString()}</span>}
        <span className="text-ink-muted" data-desk="verdict-count" title="Your Great fit and Not for me presses. The board's scorer learns from the newest 10 and 20 made before each Monday; the desk saves them itself just after midnight on Monday.">
          Your verdicts: {jobs.filter((j) => j.v === 'g').length} great fit · {jobs.filter((j) => j.v === 'n').length} not for me
        </span>
      </div>
      <DeskSettings cfg={cfg} limits={desk.limits} busy={busy} onSave={(p) => saveConfig(p, 'settings')} />
      {note && (
        <div className={`rounded-lg border p-3 text-xs ${note.error ? 'border-down/40 bg-down/5 text-down' : 'border-line bg-surface text-ink-muted'}`} role="status">
          {note.error || [note.intake, note.collect, note.submit, note.lessons && `lessons: ${note.lessons}`].filter(Boolean).join(' · ')}
          {note.preview?.items?.length ? <ul className="mt-2 list-disc pl-4">{note.preview.items.map((i) => <li key={i}>{i}</li>)}</ul> : null}
        </div>
      )}
      {!jobs.length ? (
        <div className="panel p-6 text-sm text-ink-muted">
          No job files yet. The hourly run files every job on the board; press <strong className="text-ink">Run now</strong> to file them now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
          <div className="min-w-0 max-h-[70vh] overflow-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2" title="The board's fit score, 0 to 100">Fit</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Employer</th><th className="px-3 py-2">Where</th><th className="px-3 py-2" title="The day the desk first filed it">Seen</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => (
                  <tr key={j.key} onClick={() => setSel(j.key)} aria-selected={current === j.key}
                    title={`${DESK_STATUS[j.st] || j.st} · first seen ${j.f}${j.b === 0 ? ' · no longer on the board' : ''}${j.b === 2 ? ' · pasted from a job site' : ''}${j.n === 1 ? ' · not confirmed at the employer' : ''}${j.q ? ' · queued for the next run' : ''}${j.v === 'g' ? ' · you marked it a great fit' : j.v === 'n' ? ' · you marked it not for me' : ''}`}
                    className={`cursor-pointer border-t border-line ${current === j.key ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface'}`}>
                    <td className="px-3 py-2 font-mono"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${DESK_DOT[j.st] || 'bg-line'}`} />{j.s}</td>
                    <td className="px-3 py-2 text-ink">{j.t}{j.b === 0 && <span className="ml-1 text-xs text-ink-faint">(off the board)</span>}{j.b === 2 && <span className="ml-1 text-xs text-ink-faint">(pasted)</span>}{j.n === 1 && <span className="ml-1 text-xs text-ink-faint">(unconfirmed)</span>}</td>
                    <td className="px-3 py-2">{j.c}</td>
                    <td className="px-3 py-2 text-xs">{j.p}</td>
                    <td className="px-3 py-2 font-mono text-xs">{String(j.f || '').slice(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="min-w-0">
            <DeskFile file={file} busy={busy} onStatus={setStatus} onRedo={redo} onSession={setSession} testEffort={testEffort}
              reasons={desk.reasons} onVerdict={verdict}
              onPaste={async (text) => { settle(await act({ action: 'paste', key: current, text }, 'paste')); }}
              onOpenInWriter={onOpenInWriter} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Score a posting you found (D103) ────────────────────────────────────────────
   Indeed and LinkedIn cannot be read by any script, so he pastes the posting here.
   The Worker reads the facts out of it and scores it by the board's own rules
   (scripts/lib/job-rubric.mjs), then shows each filter's verdict. Nothing is filed
   until he presses Add to my jobs. */
const BAND = (s) => (s >= 80 ? 'Excellent fit' : s >= 65 ? 'Good fit, worth applying' : s >= 50 ? 'A stretch' : s >= 30 ? 'Reach or weak fit' : 'Not a fit');
function ScorePanel({ onOpenInWriter, onAdded, onSession }) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [addedKey, setAddedKey] = useState('');
  const score = async () => {
    setError(''); setCard(null); setAddedKey('');
    if (text.trim().length < 200) { setError('Paste the whole posting: at least a few sentences, title included.'); return; }
    setBusy('score');
    const r = await postJson('/api/admin/desk', { action: 'score', text, url });
    setBusy('');
    if (r.sessionExpired) { onSession?.(r); return; }
    if (!r.ok) { setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Scoring failed${r.status ? ` (${r.status})` : ''}.`)); return; }
    setCard(r.data);
  };
  const add = async () => {
    setBusy('add');
    const r = await postJson('/api/admin/desk', { action: 'add', card, text });
    setBusy('');
    if (r.sessionExpired) { onSession?.(r); return; }
    if (!r.ok) { setError(r.data?.error || 'Not added — try again.'); return; }
    setAddedKey(r.data.key);
    onAdded?.(r.data);
  };
  const clear = () => { setText(''); setUrl(''); setCard(null); setError(''); setAddedKey(''); };
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Score a posting you found</h2>
        <span className="text-xs text-ink-faint">Copied from Indeed, LinkedIn or anywhere. Scored by the board&rsquo;s own rules.</span>
      </div>
      <textarea rows={card ? 3 : 5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole job posting here, title and pay included…" className={inputCls} title="The posting text; page menus around it are fine, the scorer reads past them. Up to 20,000 characters are read." />
      <div className="flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the posting (optional)" className={`${inputCls} sm:max-w-sm`} title="Kept on the job file if you add it to your jobs" />
        <button onClick={score} disabled={!!busy || text.trim().length < 200} className="btn btn-primary disabled:opacity-50" title="Reads the facts out of the posting, then scores it with the board's rubric; about 5 cents">
          {busy === 'score' ? 'Scoring…' : 'Score it'}
        </button>
        {(text || card) && <button onClick={clear} disabled={!!busy} className="text-xs text-cyan-deep disabled:opacity-50" title="Empties the box for the next posting">Clear</button>}
      </div>
      {error && <p className="text-sm text-down" role="alert">{error}</p>}
      {card && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/60 p-3" data-desk="scorecard">
          <p className="text-sm text-ink-muted"><strong className="text-ink">{card.title}</strong>{card.company ? ` · ${card.company}` : ''}{card.location ? ` · ${card.location}` : ''}{card.salary ? ` · ${card.salary}` : ''}</p>
          {card.verdict === 'refused' ? (
            <p className="text-sm text-down" role="status">{card.reason || card.gates?.[0]}</p>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-2xl text-ink" title="The board's fit score, 0 to 100">{card.score}</span>
                <span className="text-sm text-ink">{BAND(card.score)}</span>
                <span className="text-xs text-ink-faint">{card.familyLabel} · the board keeps {card.floor} and over</span>
              </p>
              <p className="text-sm leading-relaxed text-ink-muted">{card.why}</p>
              {card.flags?.length > 0 && <p className="flex flex-wrap gap-1.5">{card.flags.map((f) => <span key={f} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">{f}</span>)}</p>}
            </>
          )}
          {card.gates?.length > 0 && card.verdict !== 'refused' && <ul className="list-disc pl-4 text-xs text-ink-muted">{card.gates.map((g) => <li key={g}>{g}</li>)}</ul>}
          <p className="text-xs text-ink-faint">{card.wouldBoard ? 'The board would show this one.' : 'The board would not show this one.'} {card.cost ? `Cost $${Number(card.cost).toFixed(3)}.` : ''}</p>
          {card.verdict === 'scored' && (
            <div className="flex flex-wrap gap-2">
              <button onClick={add} disabled={!!busy || !!addedKey} className="btn btn-secondary disabled:opacity-50" title="Files it in your jobs below, with its posting, so it gets a brief and drafts like any board job">
                {addedKey ? 'Added to your jobs ✓' : busy === 'add' ? 'Adding…' : 'Add to my jobs'}
              </button>
              <button onClick={() => onOpenInWriter({ text, jobKey: addedKey, title: `${card.title}${card.company ? ` at ${card.company}` : ''}` })} className="btn btn-secondary" title={addedKey ? 'Opens the Writer on this posting; documents save to its job file' : 'Opens the Writer on this posting'}>Open in writer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeskFile({ file, busy, onStatus, onRedo, onPaste, onOpenInWriter, onSession, testEffort, reasons, onVerdict }) {
  const [paste, setPaste] = useState('');
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [file?.job?.key]);
  if (!file) return <div className="panel p-5 text-sm text-ink-faint">Pick a job from the list.</div>;
  if (file.error) return <div className="panel p-5 text-sm text-down" role="alert">{file.error}</div>;
  const { job, docs } = file;
  const r = job.row || {};
  const summary = !WHOLE_POSTING_FROM.includes(job.posting?.from);
  const postingText = job.posting?.text || '';
  const jd = postingText || `${r.title} at ${r.company}${r.place ? ` (${r.place})` : ''}. ${r.why || ''}`;
  // A job the finder could not confirm links only to a big job site he trusts, named, or to nothing (D110).
  const site = trustedSite(r.url);
  const link = job.pasted ? ['Posting ↗', 'The link you gave when you pasted it']
    : r.direct ? ['Employer page ↗', 'The employer’s own posting']
    : job.confirmed === false ? (site ? [`${site} ↗`, `The job as ${site} lists it; the finder could not find it on the employer’s own site`] : null)
    : ['Copy site ↗', 'The copy site that listed it; the employer’s page may differ'];
  const section = (label, children) => (
    <div className="border-t border-line pt-3">
      <p className="mono-label mb-2 text-ink-faint">{label}</p>
      {children}
    </div>
  );
  const draftSection = (kind) => (docs?.[kind]?.length
    ? <DocEditor key={`${job.key}-${kind}-${docs[kind].length}`} kind={kind} jobKey={job.key} docId={`${job.key}-${kind}`} versions={docs[kind]} warnings={docs[kind][docs[kind].length - 1]?.warnings || []} jobDescription={jd} testEffort={testEffort} onSession={onSession} />
    : (
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span>{workSays(job.work?.[kind], job)}</span>
        {job.work?.[kind] !== 'sent' && job.work?.[kind] !== 'queued' && (
          <button onClick={() => onRedo(kind)} disabled={!!busy} className="btn btn-secondary disabled:opacity-50" title="Adds it to the next run's batch">Draft in the next run</button>
        )}
      </div>
    ));

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-display text-base font-semibold text-ink">{r.title}</h3>
        <p className="text-sm text-ink-muted">{r.company} · {r.place || r.location}{r.salary ? ` · ${r.salary}` : ''} · fit <span className="font-mono text-ink">{r.score}</span></p>
        <p className="mt-1 text-xs text-ink-faint">
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${DESK_DOT[job.status] || 'bg-line'}`} />{DESK_STATUS[job.status] || job.status}
          {summary && <span className="ml-2 rounded border border-line px-1.5 text-warn" title="The feed sent only a summary; drafts were written from it. Paste the full posting below to redraft.">drafted from a summary</span>}
          {job.onBoard === false && !job.pasted && <span className="ml-2" title="No source has returned it lately; the posting may be closed">no longer on the board</span>}
          {job.pasted && <span className="ml-2" title="You pasted this one from a job site; the board never found it">pasted from a job site</span>}
          {job.confirmed === false && <span className="ml-2 rounded border border-line px-1.5 text-warn" title="The finder could not find this job on the employer’s own site, so the public board leaves it out and nothing is drafted for it unless you ask. Check it is still open before you apply.">not confirmed at the employer</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {job.status !== 'applied' && <button onClick={() => onStatus('applied')} disabled={!!busy} className="btn btn-primary disabled:opacity-50" title="Moves this job to Applied">Mark applied</button>}
        {job.status !== 'closed' ? <button onClick={() => onStatus('closed')} disabled={!!busy} className="btn btn-secondary disabled:opacity-50" title="Hides it from the open list">Close</button>
          : <button onClick={() => onStatus('new')} disabled={!!busy} className="btn btn-secondary disabled:opacity-50" title="Puts it back in the open list">Reopen</button>}
        {r.url && link && <a href={r.url} target="_blank" rel="noopener" className="btn btn-secondary" title={link[1]}>{link[0]}</a>}
        <button onClick={() => onOpenInWriter({ text: jd, jobKey: job.key, title: `${r.title} at ${r.company}` })} className="btn btn-secondary" title="Puts this posting in the writer, ready for any of the four documents">Open in writer</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" data-desk="verdict">
        <span className="text-ink-muted">
          {job.verdict ? `${job.verdict.kind === 'great' ? 'You marked it a great fit' : `Not for me: ${job.verdict.reason}`} on ${new Date(job.verdict.at).toLocaleDateString()}` : 'Teach the board:'}
        </span>
        {job.verdict?.kind !== 'great' && (
          <button onClick={() => { setPicking(false); onVerdict('great'); }} disabled={!!busy} className="btn btn-secondary disabled:opacity-50"
            title="Teaches the board's scorer that jobs like this suit you; the desk saves the week's presses for it just after midnight on Monday">Great fit</button>
        )}
        <button onClick={() => setPicking((p) => !p)} disabled={!!busy} aria-expanded={picking} className="btn btn-secondary disabled:opacity-50"
          title="Asks why, then closes the job and teaches the board's scorer to score jobs like it down">Not for me</button>
      </div>
      {picking && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Why it is not for you">
          {reasons.map((x) => (
            <button key={x} onClick={() => { setPicking(false); onVerdict('not', x); }} disabled={!!busy}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-line-2 disabled:opacity-50"
              title={`Not for me: ${x}. Closes the job and teaches the scorer.`}>{x}</button>
          ))}
          <button onClick={() => setPicking(false)} className="text-xs text-cyan-deep" title="Puts the reasons away; nothing changes">Cancel</button>
        </div>
      )}
      {section('How this was scored', <TrailList trail={job.trail} />)}
      {section('Résumé draft', draftSection('resume'))}
      {section('Cover letter draft', draftSection('cover'))}
      {section(`Company brief${job.brief?.sources?.length ? ` · ${job.brief.sources.length} source${job.brief.sources.length > 1 ? 's' : ''}` : ''}`, job.brief ? (
        <div className="flex flex-col gap-2">
          {job.brief.warnings?.length > 0 && <ul className="text-xs text-warn" data-desk="brief-warnings">{job.brief.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{job.brief.markdown}</div>
          {job.brief.sources?.length > 0 && (
            <ul className="text-xs">{job.brief.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener" className="text-cyan-deep" title={s.url}>{s.title}</a></li>)}</ul>
          )}
          <button onClick={() => onRedo('brief')} disabled={!!busy} className="self-start text-xs text-cyan-deep disabled:opacity-50" title="Writes the brief again in the next run">Redo the brief</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>{workSays(job.work?.brief, job)}</span>
          {job.work?.brief !== 'sent' && job.work?.brief !== 'queued' && <button onClick={() => onRedo('brief')} disabled={!!busy} className="btn btn-secondary disabled:opacity-50" title="Adds a company brief for this job to the next run's batch">Brief in the next run</button>}
        </div>
      ))}
      {section('Posting, saved the day it was found', (
        <div className="flex flex-col gap-2">
          <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-xs text-ink-muted">{postingText || 'No posting text came with this job.'}</div>
          {summary && (
            <>
              <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the full posting here to redraft from it…" className={inputCls} title="The employer's full posting; at least 200 characters" />
              <button onClick={() => { onPaste(paste); setPaste(''); }} disabled={paste.trim().length < 200 || !!busy} className="btn btn-secondary self-start disabled:opacity-50" title="Saves the full posting and queues fresh drafts for the next run">Use this posting</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Writer tab (D93; was the Résumé tab) ────────────────────────────────────
   NOT a publish flow. One box and four buttons, his pick: paste a posting (or,
   for a LinkedIn post, say what it is about) and press the document you want.
   A résumé with an empty box is the general best-format résumé. The Direction
   box steers the angle of every document and never changes a fact. Every result
   is saved privately with its history; a desk job's documents save to that job.
   D108: under a résumé written to a posting, one press writes its cover letter
   to the same posting, Direction and job (and the reverse); both stay open. */
const PAIR = { resume: 'cover', cover: 'resume' };
function ResumeTab({ seed, onClearSeed }) {
  const [text, setText] = useState(seed?.text || '');
  const [jobKey, setJobKey] = useState(seed?.jobKey || '');
  const [jobTitle, setJobTitle] = useState(seed?.title || '');
  const [notes, setNotes] = useState('');
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState(''); // the kind being written
  const [docs, setDocs] = useState({}); // by kind: { kind, docId, versions, warnings, meta, posting }
  const [shown, setShown] = useState('');
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [docBusy, setDocBusy] = useState({}); // by kind: a revise or regenerate in flight
  /* The D78 side-by-side: /admin/?effort=xhigh asks for xhigh on every document from this tab. */
  const testEffort = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('effort') === 'xhigh' ? { effort: 'xhigh' } : {};
  useEffect(() => { if (seed) { setText(seed.text || ''); setJobKey(seed.jobKey || ''); setJobTitle(seed.title || ''); setDocs({}); setShown(''); } }, [seed]);

  // `posting` is passed by the companion press, so the second document is written to exactly the
  // posting the first one was.
  const write = async (kind, posting = text.trim()) => {
    setError('');
    const t = posting;
    if (kind === 'linkedin' && t.length < 10) { setError('Say what the post is about in the box first.'); return; }
    if ((kind === 'cover' || kind === 'upwork' || (kind === 'resume' && t)) && t.length < 50) {
      setError(kind === 'upwork' ? 'Paste the client’s job post (at least a few sentences).' : 'Paste the job description (at least a few sentences), or empty the box for a general résumé.');
      return;
    }
    setBusy(kind);
    const r = await postJson('/api/admin/resume/generate', {
      kind, jobDescription: t, notes: kind === 'cover' ? notes.trim() : '', direction: direction.trim(),
      jobKey: kind === 'resume' || kind === 'cover' ? jobKey : '', ...testEffort,
    });
    setBusy('');
    if (r.sessionExpired) { setSession(r); return; }
    if (!r.ok) { setError(r.data?.error || (r.networkError ? 'Network error — try again.' : `Writing failed${r.status ? ` (${r.status})` : ''}.`)); return; }
    const next = { kind, docId: r.data.docId || null, versions: [{ at: new Date().toISOString(), by: 'live', markdown: r.data.markdown || '', analysis: r.data.analysis || null }], warnings: r.data.warnings || [], meta: r.data.meta || null, posting: t };
    setDocs((d) => ({ ...d, [kind]: next }));
    setShown(kind);
  };

  // Write another is a fresh start for a NEW posting (D108, amending D103): it empties the box, the
  // job link, the letter notes and the Direction. The letter for the SAME posting is the companion
  // press under the résumé instead.
  const writeAnother = () => { setDocs({}); setShown(''); setText(''); setJobKey(''); setJobTitle(''); setNotes(''); setDirection(''); setError(''); setDocBusy({}); onClearSeed?.(); };

  const notesField = (
    <Field label="Personal notes" hint="cover letters only — a referral, why this role, anything to work in">
      <textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Referred by …; what genuinely interests you about this role…" className={inputCls} title="Hooks for a cover letter only; worked in, never quoted" />
    </Field>
  );

  if (session) return <Result result={session} onReset={() => window.location.reload()} />;

  const open = ['resume', 'cover', 'upwork', 'linkedin'].filter((k) => docs[k]);
  if (open.length) {
    const doc = docs[shown] || docs[open[0]];
    const anyBusy = !!busy || Object.values(docBusy).some(Boolean);
    // A companion only for a document written to a posting, and only until the pair exists.
    const companion = PAIR[doc.kind] && doc.posting && !docs[PAIR[doc.kind]] ? PAIR[doc.kind] : '';
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="mono-label text-up">{NOUN[doc.kind]} ready{jobTitle && PAIR[doc.kind] ? ` · saved to ${jobTitle}` : ''}</p>
          <button onClick={writeAnother} disabled={anyBusy} className="text-xs text-cyan-deep disabled:opacity-50" title={anyBusy ? 'Waits for the writing in progress' : 'A fresh start for the next posting: the posting, Direction, notes and job link all clear'}>← write another</button>
        </div>
        {open.length > 1 && (
          <div className="flex gap-2" role="tablist" aria-label="Documents for this posting">
            {open.map((k) => (
              <button key={k} role="tab" aria-selected={k === doc.kind} onClick={() => setShown(k)} className={tabCls(k === doc.kind)} title={`Shows the ${NOUN[k].toLowerCase()}; the other stays as you left it, unsaved edits included`}>{NOUN[k]}</button>
            ))}
          </div>
        )}
        {/* Every open document stays mounted, so a switch keeps a redraft or an unsaved edit. */}
        {open.map((k) => (
          <div key={k} hidden={k !== doc.kind}>
            <DocEditor key={docs[k].docId || docs[k].versions[0].at} kind={k} jobKey={PAIR[k] ? jobKey : ''} docId={docs[k].docId}
              versions={docs[k].versions} warnings={docs[k].warnings} meta={docs[k].meta} jobDescription={docs[k].posting} notes={notes.trim()} direction={direction.trim()}
              testEffort={testEffort} onSession={setSession} onBusyChange={(b) => setDocBusy((s) => ({ ...s, [k]: b }))} />
          </div>
        ))}
        {companion && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface/60 p-3">
            {companion === 'cover' && notesField}
            {error && <p className="text-sm text-down" role="alert">{error}</p>}
            <button onClick={() => write(companion, doc.posting)} disabled={anyBusy} className="btn btn-primary self-start disabled:opacity-60"
              title={`Writes the ${NOUN[companion].toLowerCase()} to this same posting, with the same Direction${jobTitle ? ` and saved to ${jobTitle}` : ''}`}>
              {busy === companion ? 'Writing…' : `${NOUN[companion]} for this posting`}
            </button>
          </div>
        )}
      </div>
    );
  }

  const BUTTONS = [
    ['resume', 'Résumé', 'Tailored to the posting in the box, or a general best-format résumé when the box is empty'],
    ['cover', 'Cover letter', 'A letter in your voice to the role in the box'],
    ['upwork', 'Upwork proposal', 'A proposal in your voice to the client post in the box; it may name your employers'],
    ['linkedin', 'LinkedIn post', 'A public post about what the box describes; it never names your employer'],
  ];
  return (
    <div className="flex flex-col gap-5">
      {jobKey && (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-muted" title="A résumé or letter written here is saved to this job's file in the Jobs tab">
          Writing for <strong className="text-ink">{jobTitle}</strong>.{' '}
          <button onClick={() => { setJobKey(''); setJobTitle(''); }} className="text-cyan-deep" title="Documents written next are saved on their own, not to this job">Write for no particular job</button>
        </p>
      )}
      <Field label="The posting, the client’s post, or what the post is about" hint="empty, with Résumé, gives a general best-format résumé">
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a job description or an Upwork post, or describe the LinkedIn post…" className={inputCls} title="What every button below writes to; up to 20,000 characters are read" />
      </Field>
      <div className="flex flex-col gap-2">
        <Field label="Direction" hint="optional — the angle, tone, emphasis and length. Steers how it is written, never what is true.">
          <textarea rows={3} maxLength={2000} value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="e.g. lead with supply-chain depth; keep it to one page; warmer and shorter…" className={inputCls} title="Steers the angle of whichever document you write next; never adds a fact" />
        </Field>
        {/* Outside the Field on purpose: Field renders a <label>, and interactive content inside a
            label is invalid and would steal the click to the textarea. */}
        <div className="flex flex-wrap gap-1.5">
          {['Lead with supply-chain depth', 'Lead with the AI tools I built', 'Keep it to one page', 'Shorter — keep it tight', 'Warmer, less formal', 'Plainer language'].map((p) => (
            <button key={p} type="button" title="Adds this to the Direction box"
              onClick={() => setDirection((d) => (d.trim() ? `${d.replace(/\s+$/, '')}\n${p}.` : `${p}.`))}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-ink">
              + {p}
            </button>
          ))}
        </div>
      </div>
      {notesField}
      {error && <p className="text-sm text-down" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {BUTTONS.map(([k, label, hint]) => (
          <button key={k} onClick={() => write(k)} disabled={!!busy} title={hint}
            className={`btn ${k === 'resume' ? 'btn-primary' : 'btn-secondary'} disabled:opacity-60`}>
            {busy === k ? 'Writing…' : label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-faint">Private: every version is kept in your desk storage, never in the repo or on the site.</p>
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
      <button onClick={() => window.location.reload()} className="font-medium underline" title="Reloads the console, which sends you through Cloudflare's sign-in again">Reload to sign in</button>.
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

// `option` is one tick-box sent with the run as { [option.key]: true|false }. The job board's is
// the capped job sites (D97): unticked, a by-hand run leaves JSearch's 200 monthly calls alone.
function RefreshCard({ kind, title, what, option, children }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [opted, setOpted] = useState(false);
  const run = async () => {
    setBusy(true); setResult(null);
    const r = await postJson(`/api/admin/refresh/${kind}`, option ? { [option.key]: opted } : {});
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
      {option && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-ink-muted" title={option.help}>
          <input type="checkbox" checked={opted} onChange={(e) => setOpted(e.target.checked)} className="mt-0.5" data-option={option.key} title={option.help} />
          <span>
            {option.label}
            <span className="block text-ink-faint">{option.help}</span>
          </span>
        </label>
      )}
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
        Repos and the job board pull from public APIs, and a scheduled action refreshes both every
        morning; Run now refreshes either one sooner. Tools, architectures, and cron read from your private
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

      <RefreshCard
        kind="jobs"
        title="Job board"
        what="Re-pulls and AI-scores fresh listings from the free feeds, employer and planning-software boards, USAJOBS and web search."
        option={{
          key: 'capped',
          label: 'Also use JSearch and Adzuna',
          help: "Off by default. JSearch allows 200 calls a month and the morning runs need 186, so each by-hand run with this ticked spends 6 of the spare 14. The morning run always uses both.",
        }}
      >
        <Walkthrough summary="How this works — and how to run it yourself">
          <p><strong className="text-ink">Run now</strong> fires the same action for the job board. Its keyed sources read their keys from <em>GitHub Actions</em> (see the Setup tab), each skipping itself when its key is missing, and AI scoring needs an Anthropic key. JSearch and Adzuna run on a by-hand run only when the box above is ticked.</p>
          <p>From your machine: <Cmd>npm run fetch:jobs</Cmd> → review the diff → commit. A thin morning warns and still writes: rows seen in the last week are held, so a source outage thins the board over a week instead of wiping it.</p>
        </Walkthrough>
      </RefreshCard>

      <div className="panel p-5">
        <div className="flex items-center gap-3">
          <span className="mono-label shrink-0 rounded bg-surface-2 px-2 py-1 text-ink-faint">local only</span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Tools · Architectures · Cron</h3>
            <p className="mt-0.5 text-xs text-ink-faint">Exported from your private Command Center OS and this machine’s scheduled jobs — the cloud can’t reach those, so there’s no button; the 5am site-check window offers Publish each morning.</p>
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
        <li>Name <Cmd>ANTHROPIC_API_KEY</Cmd>, paste the key, <strong className="text-ink">Deploy</strong>. The monthly spend cap is set on its workspace, not on the key.</li>
        <li>Use the key in the <Cmd>ian-provencher-console</Cmd> workspace — one key per application, so spend is attributable and any single key can be capped or revoked on its own.</li>
      </Steps>
    ),
  },
  {
    key: 'RESUME_KV (key: full)', where: 'Workers KV',
    powers: 'The private résumé + cover-letter generator — your real, employer-named canonical career data. KV is the source; the old RESUME_FULL secret is still read as a fallback when KV is empty, so leave it unset in production.',
    steps: (
      <Steps>
        <li>Edit the chapters in <Cmd>career/knowledge/</Cmd>, then run <Cmd>node scripts/career/sync-knowledge.mjs --sync</Cmd>. It refuses a base that fails its checks, saves a dated backup, writes <Cmd>full</Cmd> and reads it back. Sunday’s draft and your Add press in the 5am window do the same for you.</li>
        <li>The base stays in the private repository and never reaches the public site. Chapter 00’s rules bind every document the writer drafts.</li>
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
              <h3 className="font-mono text-sm font-semibold text-ink">ADZUNA · RAPIDAPI · USAJOBS keys</h3>
              <p className="text-xs text-ink-faint">GitHub Actions repo secrets — power the keyed sources of the scheduled job pull</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            These live with the Action, not the Worker, so there’s no live dot for them — check the last refresh run on the Data tab.
          </p>
          <Walkthrough summary="How to set them">
            <Steps>
              <li>Free account at <a href="https://developer.adzuna.com" target="_blank" rel="noopener" className="text-cyan-deep underline">developer.adzuna.com</a> → get an <em>app_id</em> and <em>app_key</em>.</li>
              <li>GitHub → repo → <strong className="text-ink">Settings → Secrets and variables → Actions → New repository secret</strong>.</li>
              <li>Add <Cmd>ADZUNA_APP_ID</Cmd> and <Cmd>ADZUNA_APP_KEY</Cmd>; for JSearch, <Cmd>RAPIDAPI_KEY</Cmd>; for federal postings, <Cmd>USAJOBS_API_KEY</Cmd> and <Cmd>USAJOBS_USER_AGENT</Cmd> (a contact email). Each source skips itself when its key is missing.</li>
              <li>For AI fit-scoring, also add <Cmd>ANTHROPIC_API_KEY</Cmd> here — but use a <strong className="text-ink">separate key</strong> from the Worker&rsquo;s, the key in the <Cmd>ian-provencher-board</Cmd> workspace, which carries its own cap (the Worker&rsquo;s is in <Cmd>ian-provencher-console</Cmd>). This is a different key store on a different trust boundary, and it is the only unattended spender: the Action runs daily, scores a capped number of postings in batches, and reuses any recent score. Without it the board scores by keywords and says so in the run log; with it, a failed batch is never published as a keyword guess.</li>
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
  { lever: 'Generate your résumé or a cover letter (tailored to a JD)', where: 'This console → Jobs → Writer', how: 'Saves each version on the job; the Word, plain-text and print buttons give you the file. Private — never committed.' },
  { lever: 'Look up how any part of the job hunt works', where: 'This console → Handbook', how: 'Search it, or follow a desk job’s “How this was scored” into the section that explains each step.' },
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

/* ── CONTENT group — the publish tabs, listed once in the array below ─────────── */

// A tab or group mounts the first time it is shown and then stays mounted, hidden, so what he typed
// survives a switch. useSeen() records which have been shown.
function useSeen(current) {
  const [seen, setSeen] = useState(() => new Set([current]));
  useEffect(() => { setSeen((s) => (s.has(current) ? s : new Set([...s, current]))); }, [current]);
  return seen;
}
const tabCls = (on) => `rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${on ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-2'}`;

/* ── JOBS group — the paste scorer and the desk, and the Writer beside them ───── */
function JobsArea({ tab, setTab, seed, onOpenInWriter, onClearSeed, testEffort }) {
  const seen = useSeen(tab);
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Jobs">
        {[['desk', 'Desk', 'Score a posting you found, and every job on your desk'], ['writer', 'Writer', 'Résumés, cover letters, Upwork proposals and LinkedIn posts']].map(([k, label, hint]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tabCls(tab === k)} title={hint}>{label}</button>
        ))}
      </div>
      {seen.has('desk') && <div hidden={tab !== 'desk'}><JobsGroup onOpenInWriter={onOpenInWriter} testEffort={testEffort} active={tab === 'desk'} /></div>}
      {seen.has('writer') && <div hidden={tab !== 'writer'}><ResumeTab seed={seed} onClearSeed={onClearSeed} /></div>}
    </div>
  );
}

function ContentGroup({ tab, setTab }) {
  const seen = useSeen(tab);
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Publish to">
        {[['blog', 'Blog post'], ['tips', 'Tip'], ['news', 'Signal'], ['favorites', 'Favorite'], ['glossary', 'Glossary'], ['learn', 'Learn']].map(([k, label]) => (
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
      {seen.has('blog') && <div hidden={tab !== 'blog'}><BlogTab /></div>}
      {seen.has('tips') && <div hidden={tab !== 'tips'}><TipsTab /></div>}
      {seen.has('news') && <div hidden={tab !== 'news'}><SignalTab /></div>}
      {seen.has('favorites') && <div hidden={tab !== 'favorites'}><FavoritesTab /></div>}
      {seen.has('glossary') && <div hidden={tab !== 'glossary'}><GlossaryTab /></div>}
      {seen.has('learn') && <div hidden={tab !== 'learn'}><LearnTab /></div>}
    </div>
  );
}

/* ── HANDBOOK group — the job hunt's method, served behind the login (D117) ──────────────────────
   This file holds no handbook text: the Worker serves it from worker/handbook.generated.json, built
   from worker/handbook/ with every figure read from the code. */

// A section's address in the console, so a link can open it from anywhere.
const HB_PREFIX = '#handbook/';
const handbookIdFromHash = () => (typeof window !== 'undefined' && window.location.hash.startsWith(HB_PREFIX) ? decodeURIComponent(window.location.hash.slice(HB_PREFIX.length)) : '');
const HB_HOME = 'start-one-page';
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Print rules a handbook section needs and a draft never has.
const HB_PRINT_CSS = 'table { border-collapse: collapse; margin: 4pt 0 8pt; } th, td { border: 0.5pt solid; padding: 2pt 4pt; text-align: left; vertical-align: top; font-size: 9pt; } pre { white-space: pre-wrap; font-size: 8pt; } code { font-family: Consolas, monospace; font-size: 0.9em; } details summary { font-weight: bold; margin: 4pt 0; }';

// Prints a page through a hidden frame that may open the print dialog and nothing else.
function printInFrame(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

function HandbookGroup({ active, target }) {
  const [book, setBook] = useState(null);
  const [problem, setProblem] = useState('');
  const [session, setSession] = useState(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const id = target || HB_HOME;

  const load = async () => {
    const r = await postJson('/api/admin/handbook', {});
    if (r.sessionExpired) { setSession(r); return; }
    if (!r.ok) { setProblem(r.data?.error || (r.networkError ? 'Network error — reload to try again.' : `The handbook did not answer (${r.status}).`)); return; }
    setProblem('');
    setBook(r.data);
  };
  // Read again each time it comes into view, so its live values are today's.
  useEffect(() => { if (active) load(); }, [active]);

  if (session) return <Result result={session} onReset={() => window.location.reload()} />;
  if (problem) return <div className="panel p-5"><p className="text-sm text-down" role="alert">{problem}</p></div>;
  if (!book) return <p className="text-sm text-ink-faint">Opening the handbook…</p>;

  const byId = Object.fromEntries(book.sections.map((s) => [s.id, s]));
  const section = byId[id] || byId[HB_HOME] || book.sections[0];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? book.sections.filter((s) => {
    const hay = `${s.title} ${s.summary.join(' ')} ${s.text}`.toLowerCase();
    const inPrompt = String(s.promptText || '').toLowerCase();
    return words.every((w) => hay.includes(w) || inPrompt.includes(w));
  }) : [];
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${HB_PREFIX}${section.id}`); setCopied(section.id); setTimeout(() => setCopied(''), 1500); }
    catch { setCopied('failed'); }
  };
  const print = () => printInFrame(printPage(`<h1>${escapeText(section.title)}</h1>${section.html.replace(/<details\b/g, '<details open')}`, { kind: 'handbook', title: section.title, css: HB_PRINT_CSS }));

  return (
    <div className="handbook flex flex-col gap-4 lg:flex-row lg:gap-6" data-handbook="root">
      <aside className="shrink-0 lg:w-60" aria-label="Handbook contents">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the handbook" data-handbook="search"
          title="Searches every section's title, text and the prompts as they are sent" className={`${inputCls} mb-3 w-full`} />
        {words.length > 0 && (
          <div className="mb-3 text-xs" data-handbook="results">
            <p className="mb-1 text-ink-faint">{found.length} section{found.length === 1 ? '' : 's'} match</p>
            <ul className="flex flex-col gap-1">
              {found.map((s) => <li key={s.id}><a href={`${HB_PREFIX}${s.id}`} title={s.summary[0]} className="text-cyan-deep">{s.title}</a></li>)}
            </ul>
          </div>
        )}
        <nav className="hb-contents flex flex-col gap-3 text-xs">
          {book.parts.map((p) => (
            <div key={p.name}>
              <p className="mono-label mb-1 text-ink-faint">{p.name}</p>
              <ul className="flex flex-col gap-0.5">
                {p.sections.map((sid) => (
                  <li key={sid}>
                    <a href={`${HB_PREFIX}${sid}`} aria-current={sid === section.id ? 'page' : undefined} title={byId[sid].summary[0]}
                      className={`block rounded px-1.5 py-0.5 ${sid === section.id ? 'bg-accent/10 text-ink' : 'text-ink-muted hover:text-ink'}`}>
                      {byId[sid].title}{byId[sid].stale && <span className="hb-stale-dot" role="img" aria-label="may be behind" title={`The code it explains changed on ${byId[sid].stale.day}, after it was last checked`} />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <article className="panel min-w-0 flex-1 p-5" data-handbook="section" data-section={section.id}>
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="mr-auto font-display text-xl font-semibold text-ink">{section.title}</h2>
          <button onClick={copyLink} className="btn btn-secondary" title="Copies a link that opens this section">{copied === section.id ? 'Link copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}</button>
          <button onClick={print} className="btn btn-secondary" title="Prints this section with its folds open">Print</button>
        </div>
        <ul className="hb-summary mt-3" data-handbook="summary">{section.summary.map((l) => <li key={l}>{l}</li>)}</ul>
        {section.stale && (
          <p className="hb-stale mt-3" role="status" data-handbook="stale">
            The code this explains changed on {section.stale.day} (<code>{section.stale.file}</code>), after this section was last checked on {section.checked}. It may be behind.
          </p>
        )}
        {!book.changeDays && <p className="hb-stale mt-3" role="status">This build could not read when the code last changed, so a section that has fallen behind is not marked.</p>}
        <div className="hb-body mt-4" dangerouslySetInnerHTML={{ __html: section.html }} />
        <p className="mt-6 text-xs text-ink-faint">Last checked {section.checked} · built {book.builtOn}. A dotted figure shows where it comes from when you hover it.</p>
      </article>
    </div>
  );
}

// ── "How this was scored": a desk job's trail, each line opening the section that explains it ──
const TRACK_WORDS = { planning: 'Planning', 'ai-lead': 'AI-lead' };
const FROM_WORDS = {
  feed: 'the whole posting, from the source’s feed', page: 'the posting’s own page, read because the feed sent only a summary',
  employer: 'the employer’s own posting', summary: 'only the summary the source sent', none: 'no posting text', withheld: 'nothing: the privacy scan withheld it',
  pasted: 'the text you pasted',
};
const STAGE_WORDS = {
  'own list': 'the employer’s own job list carried it', direct: 'its link was already the employer’s page',
  'copy page': 'the copy site’s page linked to the employer’s posting', 'known board': 'it was on the employer’s job board, already known',
  'guessed board': 'it was on the employer’s job board, found by guessing the board’s address',
};
function trailLines(t) {
  if (!t) return [];
  const out = [];
  if (t.text) out.push(['board-first-cuts', `Scored from ${FROM_WORDS[t.text.from] || t.text.from}, ${Number(t.text.chars || 0).toLocaleString()} characters${t.text.cut ? ', its end cut' : ''}${t.text.page === 'nothing longer' ? '; its page was read and gave nothing longer' : ''}.`]);
  const sc = t.score || {};
  const scoreSays = { fresh: `The AI scored it on ${sc.day}.`, reused: `It reused the AI’s score from ${sc.day}, made under the same rules.`, keywords: 'It was scored by keywords: that run had no AI key.',
    kept: 'It kept its earlier score: the AI did not score it again.', pasted: `Paste-to-score scored it on ${sc.day}.` };
  if (sc.how) out.push([sc.how === 'pasted' ? 'desk-paste' : sc.how === 'reused' ? 'board-score-memory' : 'board-ai-score', scoreSays[sc.how] || sc.how]);
  const e = t.employer;
  if (e) {
    const search = { found: '', 'nothing found': '; the search lookup found nothing', waiting: '; it waits for its next search lookup', failed: '; the search lookup failed' }[e.search] ?? '';
    out.push([e.search ? 'board-search-lookup' : 'board-confirming', e.found
      ? `Confirmed at the employer${e.search === 'found' ? ' by the search lookup' : ''}: ${STAGE_WORDS[e.stage] || e.stage}${e.cut ? ', but its address is cut by the safety scan, so it stays on the desk' : ''}.`
      : `Not found at the employer${e.tried?.length ? ` (tried ${e.tried.join(', ')})` : ''}${search}.`]);
  }
  if (t.rescore) out.push([t.rescore.on === 'employer' ? 'board-search-lookup' : 'board-hold', t.rescore.on === 'employer'
    ? `Scored again on the employer’s own text: ${t.rescore.from} → ${t.rescore.to ?? 'not scored, so back to the desk'}${t.rescore.reused ? ' (a judgement remembered from an earlier run)' : ''}.`
    : `Scored again under today’s rules: ${t.rescore.from} → ${t.rescore.to}.`]);
  if (t.hold) out.push(['board-hold', `Held: no source has returned it since ${t.hold.lastReturned}; held since ${t.hold.since}.`]);
  const tr = t.track;
  if (tr) out.push(['board-tracks-flags', tr.set === 'board' ? `${TRACK_WORDS[tr.name] || tr.name} track: number ${tr.rank} of at most ${tr.cap}, over its floor of ${tr.floor}.`
    : tr.set === 'desk' ? `On the desk only, not the public board: not confirmed at the employer (${TRACK_WORDS[tr.name] || tr.name} track, floor ${tr.floor}).`
    : `${TRACK_WORDS[tr.name] || tr.name} track, floor ${tr.floor}.`]);
  for (const g of t.gates || []) out.push(['desk-paste', g]);
  return out;
}
function TrailList({ trail }) {
  const lines = trailLines(trail);
  if (!lines.length) return <p className="text-sm text-ink-faint">No record yet: the board’s next morning run writes one for every job it keeps.</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm text-ink-muted" data-desk="trail">
      {lines.map(([sid, words], i) => (
        <li key={i}>{words} <a href={`${HB_PREFIX}${sid}`} className="text-xs text-cyan-deep" title="Opens the handbook section that explains this step">How this works</a></li>
      ))}
      {trail?.day && <li className="text-xs text-ink-faint">From the board run of {trail.day}.</li>}
    </ul>
  );
}

/* ── The console shell — four groups down the left, panel on the right ────────── */

const GROUPS = [
  ['jobs', 'Jobs', 'Score a posting you found, every board job with its brief and drafts, and the writer'],
  ['handbook', 'Handbook', 'How the job hunt works: the board, the desk, the writer and the knowledge base'],
  ['content', 'Content', 'Publish posts, tips and links'],
  ['data', 'Data', 'Refresh repos + jobs; how to refresh the rest'],
  ['setup', 'Setup', 'Which keys are set, and how to set them'],
  ['runbook', 'Runbook', 'Every manual lever, in one place'],
];

export default function AdminConsole() {
  const [group, setGroup] = useState('jobs');
  const [tab, setTab] = useState('blog');
  const [jobsTab, setJobsTab] = useState('desk');
  const [seed, setSeed] = useState(null); // a posting handed to the writer by "Open in writer"
  const [hbTarget, setHbTarget] = useState('');
  const seenGroups = useSeen(group);
  // A #handbook/<id> address opens that section, from a trail line, a copied link or a reload.
  useEffect(() => {
    const follow = () => { const id = handbookIdFromHash(); if (id) { setHbTarget(id); setGroup('handbook'); } };
    // The site's page router takes same-page link clicks and moves the address with no hash-change
    // event, so a handbook link is taken first here, in the capture phase, and the router skips it.
    const take = (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="#handbook/"]') : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      window.location.hash = a.getAttribute('href').slice(1);
    };
    follow();
    window.addEventListener('hashchange', follow);
    window.addEventListener('click', take, true);
    return () => { window.removeEventListener('hashchange', follow); window.removeEventListener('click', take, true); };
  }, []);
  const { status, error } = useStatus();
  const testEffort = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('effort') === 'xhigh' ? { effort: 'xhigh' } : {};
  const openInWriter = (s) => { setSeed({ ...s, at: Date.now() }); setJobsTab('writer'); setGroup('jobs'); };
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
        {seenGroups.has('handbook') && <div hidden={group !== 'handbook'}><HandbookGroup active={group === 'handbook'} target={hbTarget} /></div>}
        {seenGroups.has('jobs') && <div hidden={group !== 'jobs'}><JobsArea tab={jobsTab} setTab={setJobsTab} seed={seed} onOpenInWriter={openInWriter} onClearSeed={() => setSeed(null)} testEffort={testEffort} /></div>}
        {seenGroups.has('content') && <div hidden={group !== 'content'}><ContentGroup tab={tab} setTab={setTab} /></div>}
        {seenGroups.has('data') && <div hidden={group !== 'data'}><DataGroup status={status} /></div>}
        {seenGroups.has('setup') && <div hidden={group !== 'setup'}><SetupGroup status={status} statusError={error} /></div>}
        {seenGroups.has('runbook') && <div hidden={group !== 'runbook'}><RunbookGroup /></div>}
      </div>
    </div>
  );
}
