import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { RESULT_CAP, norm, runSearch, loadIndex, highlightSegments } from '../../lib/search-core.js';

/* ============================================================================
   SearchOverlay — the site-wide search island (mounted once in PageLayout).

   Hand-rolled, zero-dependency: a build-time index (/search-index.json) fetched
   lazily on first open, normalized once, matched by a small multi-term AND
   scorer. SSR-safe — default state is closed, no window/document at module
   scope; every browser touch lives inside a useEffect or an event handler.

   Triggers: ⌘K / Ctrl+K (toggle), "/" (open when not typing in a field), and a
   `ip:search-open` window event dispatched by the header Search button.
   ============================================================================ */

const optId = (i) => `ip-search-opt-${i}`;

/** Render highlightSegments as <mark>/text nodes for React. */
function renderHighlight(text, tokens) {
  return highlightSegments(text, tokens).map((seg, i) =>
    seg.hit
      ? <mark key={i} className="search-hit">{seg.text}</mark>
      : <Fragment key={i}>{seg.text}</Fragment>,
  );
}

// A few section quick-scopes shown on the empty state (label → seed query).
const QUICK = ['Blog', 'Builds', 'Architectures', 'Stack', 'Repos', 'Jobs'];

// ── component ────────────────────────────────────────────────────────────────

export default function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const indexRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const scopeRef = useRef(null);
  const prevFocusRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  // ── global triggers: ⌘K / Ctrl+K, "/", and the header event ──────────────
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === '/' && !openRef.current && !isTyping()) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('ip:search-open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('ip:search-open', onOpen);
    };
  }, []);

  // ── lazy index load on first open ──────────────────────────────────────────
  useEffect(() => {
    if (!open || ready) return;
    setLoading(true);
    let cancelled = false;
    loadIndex().then((idx) => {
      if (cancelled) return;
      indexRef.current = idx;
      setReady(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, ready]);

  // ── open/close side effects: focus, scroll lock, focus restore, reset ──────
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
      // reset for a clean next open
      setQuery('');
      setScope('all');
      setScopeOpen(false);
      setActiveIndex(0);
    };
  }, [open]);

  // ── derived results ─────────────────────────────────────────────────────────
  const tokens = useMemo(
    () => norm(query).split(/\s+/).filter(Boolean),
    [query],
  );

  const matched = useMemo(
    () => (ready ? runSearch(indexRef.current, query) : []),
    [ready, query],
  );

  const counts = useMemo(() => {
    const m = new Map();
    for (const { rec } of matched) m.set(rec.typeLabel, (m.get(rec.typeLabel) || 0) + 1);
    return m;
  }, [matched]);

  // Grouped-by-type view (group order = best score first), plus a flat list for
  // keyboard nav that matches the rendered order exactly.
  const { groups, flat } = useMemo(() => {
    const filtered = scope === 'all' ? matched : matched.filter((x) => x.rec.typeLabel === scope);
    const capped = filtered.slice(0, RESULT_CAP);
    const order = [];
    const byType = new Map();
    for (const x of capped) {
      if (!byType.has(x.rec.typeLabel)) { byType.set(x.rec.typeLabel, []); order.push(x.rec.typeLabel); }
      byType.get(x.rec.typeLabel).push(x.rec);
    }
    const grps = order.map((label) => ({ label, items: byType.get(label) }));
    return { groups: grps, flat: grps.flatMap((g) => g.items) };
  }, [matched, scope]);

  // Scopes = All + each typeLabel present, most-populous first.
  const scopes = useMemo(() => {
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return [{ label: 'all', display: 'All sections', count: matched.length }, ...entries.map(([label, count]) => ({ label, display: label, count }))];
  }, [counts, matched.length]);

  // Keep activeIndex in range as the visible list changes.
  useEffect(() => { setActiveIndex(0); }, [query, scope]);
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(flat.length ? flat.length - 1 : 0);
  }, [flat.length, activeIndex]);

  // Scroll the active option into view.
  useEffect(() => {
    if (!open || !flat.length) return;
    const el = document.getElementById(optId(activeIndex));
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, flat.length]);

  // When the scope popover opens, move focus into it so arrow-roving + Escape work.
  useEffect(() => {
    if (scopeOpen && scopeRef.current) {
      scopeRef.current.querySelector('[role="option"]')?.focus();
    }
  }, [scopeOpen]);

  // ── actions ───────────────────────────────────────────────────────────────
  const activate = useCallback((rec) => {
    if (!rec) return;
    if (rec.external) window.open(rec.url, '_blank', 'noopener');
    else window.location.href = rec.url;
    setOpen(false);
  }, []);

  const move = useCallback((delta) => {
    setActiveIndex((i) => {
      const n = flat.length;
      if (!n) return 0;
      return (i + delta + n) % n;
    });
  }, [flat.length]);

  // Input keyboard: arrows / enter / escape.
  const onInputKeyDown = (e) => {
    if (scopeOpen) return; // scope popover owns the keys while it's open
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); setActiveIndex(0); break;
      case 'End': e.preventDefault(); setActiveIndex(flat.length ? flat.length - 1 : 0); break;
      case 'Enter': e.preventDefault(); activate(flat[activeIndex]); break;
      default: break;
    }
  };

  // Dialog-level keyboard: Escape + a simple focus trap on Tab.
  const onPanelKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (scopeOpen) setScopeOpen(false);
      else setOpen(false);
      return;
    }
    if (e.key === 'Tab' && panelRef.current) {
      const focusables = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  // Scope popover keyboard (roving).
  const onScopeKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setScopeOpen(false); inputRef.current?.focus(); return; }
    const btns = scopeRef.current ? [...scopeRef.current.querySelectorAll('[role="option"]')] : [];
    if (!btns.length) return;
    const cur = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(cur + 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(cur - 1 + btns.length) % btns.length].focus(); }
  };

  const pickScope = (label) => {
    setScope(label);
    setScopeOpen(false);
    inputRef.current?.focus();
  };

  const liveMsg = !query.trim()
    ? ''
    : `${flat.length} result${flat.length === 1 ? '' : 's'}${scope === 'all' ? '' : ` in ${scope}`}`;

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const scopeLabel = scope === 'all' ? 'All sections' : scope;

  return (
    <div
      className="search-scrim fixed inset-0 z-[100] flex justify-center px-3 pt-3 sm:pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      {/* panel--flat: the scrim behind this dialog already carries a blur, so glassing the
          panel too would stack a second backdrop-filter for no legibility gain — and a
          translucent results list over a blurred page is harder to read, not easier. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site search"
        onKeyDown={onPanelKeyDown}
        className="search-panel panel panel--flat flex w-full max-w-2xl flex-col overflow-hidden"
      >
        {/* Search row */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <svg
            className="h-4 w-4 shrink-0 text-ink-faint"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>

          <label htmlFor="ip-search-input" className="sr-only">Search the site</label>
          <input
            ref={inputRef}
            id="ip-search-input"
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={flat.length ? 'ip-search-listbox' : undefined}
            aria-activedescendant={flat.length ? optId(activeIndex) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search across the site…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />

          {/* Scope filter */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setScopeOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={scopeOpen}
              className="btn btn-secondary inline-flex items-center gap-1.5 px-2.5 py-2 text-xs"
            >
              <span className="max-w-[7.5rem] truncate text-ink-muted">{scopeLabel}</span>
              <span aria-hidden="true" className="text-ink-faint">▾</span>
            </button>
            {scopeOpen && (
              <ul
                ref={scopeRef}
                role="listbox"
                aria-label="Filter by section"
                onKeyDown={onScopeKeyDown}
                className="search-scope-pop panel absolute right-0 top-[calc(100%+0.35rem)] z-10 max-h-72 w-56 overflow-auto py-1"
              >
                {scopes.map((s) => (
                  <li key={s.label} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={scope === s.label}
                      onClick={() => pickScope(s.label)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                        scope === s.label ? 'text-ink' : 'text-ink-muted'
                      } hover:bg-surface-2`}
                    >
                      <span className="truncate">{s.display}</span>
                      <span className="mono-label shrink-0">{s.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Results / states */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!hasQuery ? (
            <div className="px-4 py-6">
              <p className="text-sm text-ink-muted">Type to search across the site — pages, posts, tools, architectures, and more.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setQuery(q); inputRef.current?.focus(); }}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line-2 hover:text-ink"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : loading && !ready ? (
            <p className="px-4 py-6 text-sm text-ink-faint">Loading…</p>
          ) : flat.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-sm text-ink-muted">
                No matches for <span className="text-ink">“{query.trim()}”</span>
                {scope !== 'all' && <> in <span className="text-ink">{scope}</span></>}.
              </p>
              {scope !== 'all' && (
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className="mt-3 text-sm text-cyan-deep hover:text-cyan"
                >
                  Clear the section filter →
                </button>
              )}
            </div>
          ) : (
            <ul id="ip-search-listbox" role="listbox" aria-label="Search results" className="py-2">
              {(() => {
                let flatIdx = -1;
                return groups.map((g) => (
                  <li key={g.label} role="none">
                    <div className="mono-label px-4 pb-1 pt-3">{g.label}</div>
                    <ul role="none">
                      {g.items.map((rec) => {
                        flatIdx += 1;
                        const i = flatIdx;
                        const isActive = i === activeIndex;
                        return (
                          <li key={rec.id} role="none">
                            <div
                              id={optId(i)}
                              role="option"
                              aria-selected={isActive}
                              tabIndex={-1}
                              onMouseEnter={() => setActiveIndex(i)}
                              onClick={() => activate(rec)}
                              className={`search-result mx-2 flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 ${
                                isActive ? 'is-active' : ''
                              }`}
                            >
                              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5">
                                <span
                                  className="search-dot h-1.5 w-1.5 rounded-full"
                                  style={{ '--dot': `var(--color-${rec.accent})` }}
                                />
                                <span className="mono-label">{rec.typeLabel}</span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-sm text-ink">
                                  <span className="truncate">{renderHighlight(rec.title, tokens)}</span>
                                  {rec.external && <span aria-hidden="true" className="shrink-0 text-ink-faint">↗</span>}
                                </span>
                                {rec.excerpt && (
                                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                                    {renderHighlight(rec.excerpt, tokens)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ));
              })()}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="hidden items-center justify-between gap-3 border-t border-line px-4 py-2 text-ink-faint sm:flex">
          <span className="mono-label">
            {hasQuery ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : 'Search'}
          </span>
          <span className="flex items-center gap-3 text-[11px]">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </span>
        </div>

        <div aria-live="polite" className="sr-only">{liveMsg}</div>
      </div>
    </div>
  );
}
