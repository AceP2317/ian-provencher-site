import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { RESULT_CAP, norm, runSearch, loadIndex, highlightSegments } from '../../lib/search-core.js';

/* ============================================================================
   HeaderSearch — the persistent "hybrid" search bar in the site header.

   Desktop (md+): a real search field + a section scope dropdown, with results
   dropping down live in a popover as you type. Mobile (<md): collapses to a
   compact search icon that opens the ⌘K command palette (SearchOverlay), so the
   sticky header stays uncluttered. Shares the engine + one index fetch with the
   overlay via search-core (whichever loads /search-index.json first, both use it).
   ============================================================================ */

const optId = (i) => `ip-hs-opt-${i}`;

function renderHighlight(text, tokens) {
  return highlightSegments(text, tokens).map((seg, i) =>
    seg.hit
      ? <mark key={i} className="search-hit">{seg.text}</mark>
      : <Fragment key={i}>{seg.text}</Fragment>,
  );
}

export default function HeaderSearch() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [open, setOpen] = useState(false);       // results popover visible
  const [scopeOpen, setScopeOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const scopeRef = useRef(null);
  const indexRef = useRef(null);

  // Lazy index load — on first focus (never fetched for users who don't search).
  const ensureIndex = useCallback(() => {
    if (ready || indexRef.current) return;
    loadIndex().then((idx) => { indexRef.current = idx; setReady(true); });
  }, [ready]);

  // ── derived results ────────────────────────────────────────────────────────
  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);
  const matched = useMemo(
    () => (ready ? runSearch(indexRef.current, query) : []),
    [ready, query],
  );

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

  // Static section list (distinct typeLabels, most-populous first), annotated
  // with live match counts — a stable dropdown you can pre-scope with.
  const typeLabels = useMemo(() => {
    if (!ready || !indexRef.current) return [];
    const m = new Map();
    for (const r of indexRef.current) m.set(r.typeLabel, (m.get(r.typeLabel) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  }, [ready]);

  const scopes = useMemo(() => {
    const live = new Map();
    for (const { rec } of matched) live.set(rec.typeLabel, (live.get(rec.typeLabel) || 0) + 1);
    return [
      { label: 'all', display: 'All sections', count: matched.length },
      ...typeLabels.map((label) => ({ label, display: label, count: live.get(label) || 0 })),
    ];
  }, [typeLabels, matched]);

  const hasQuery = query.trim().length > 0;
  // Hide the results popover while the scope dropdown is open so they don't overlap.
  const showPop = open && hasQuery && !scopeOpen;

  // Keep activeIndex sane as the visible list changes.
  useEffect(() => { setActiveIndex(0); }, [query, scope]);
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(flat.length ? flat.length - 1 : 0);
  }, [flat.length, activeIndex]);
  useEffect(() => {
    if (!showPop || !flat.length) return;
    document.getElementById(optId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showPop, flat.length]);

  // Close popover(s) on outside click and on route/escape.
  useEffect(() => {
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setScopeOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (scopeOpen && scopeRef.current) scopeRef.current.querySelector('[role="option"]')?.focus();
  }, [scopeOpen]);

  // ── actions ────────────────────────────────────────────────────────────────
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

  const onInputKeyDown = (e) => {
    if (scopeOpen) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!open && hasQuery) setOpen(true); else move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); setActiveIndex(0); break;
      case 'End': e.preventDefault(); setActiveIndex(flat.length ? flat.length - 1 : 0); break;
      case 'Enter': e.preventDefault(); if (showPop) activate(flat[activeIndex]); break;
      case 'Escape': e.preventDefault(); setOpen(false); break;
      default: break;
    }
  };

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
    if (hasQuery) setOpen(true);
  };

  const scopeLabel = scope === 'all' ? 'All sections' : scope;

  return (
    <div ref={rootRef} className="relative flex flex-1 justify-end md:max-w-xl md:justify-start">
      {/* Mobile: compact icon → opens the ⌘K palette (bridged by SiteHeader's inline script). */}
      <button
        type="button"
        data-search-open
        aria-label="Search the site"
        aria-keyshortcuts="Meta+K Control+K"
        className="btn btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm md:hidden"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {/* Desktop: the persistent hybrid field (input + scope dropdown). */}
      <div className="hidden w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 focus-within:border-line-2 md:flex">
        <svg className="h-4 w-4 shrink-0 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>

        <label htmlFor="ip-hs-input" className="sr-only">Search the site</label>
        <input
          ref={inputRef}
          id="ip-hs-input"
          type="text"
          role="combobox"
          aria-expanded={showPop}
          aria-controls={showPop && flat.length ? 'ip-hs-listbox' : undefined}
          aria-activedescendant={showPop && flat.length ? optId(activeIndex) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search the site…"
          value={query}
          onFocus={() => { ensureIndex(); if (hasQuery) setOpen(true); }}
          onChange={(e) => { ensureIndex(); setQuery(e.target.value); setOpen(e.target.value.trim().length > 0); }}
          onKeyDown={onInputKeyDown}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />

        {/* Section scope dropdown */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => { ensureIndex(); setScopeOpen((v) => !v); }}
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:border-line-2 hover:text-ink"
          >
            <span className="max-w-[6.5rem] truncate">{scopeLabel}</span>
            <span aria-hidden="true" className="text-ink-faint">▾</span>
          </button>
          {scopeOpen && (
            <ul
              ref={scopeRef}
              role="listbox"
              aria-label="Filter by section"
              onKeyDown={onScopeKeyDown}
              className="search-scope-pop panel absolute right-0 top-[calc(100%+0.4rem)] z-[60] max-h-72 w-56 overflow-auto py-1"
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
                    {hasQuery && <span className="mono-label shrink-0">{s.count}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Results popover (desktop) */}
      {showPop && (
        <div className="header-search-pop panel absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 hidden max-h-[min(70vh,560px)] overflow-y-auto md:block">
          {flat.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-muted">
              No matches for <span className="text-ink">“{query.trim()}”</span>
              {scope !== 'all' && <> in <span className="text-ink">{scope}</span></>}.
              {scope !== 'all' && (
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className="ml-2 text-cyan-deep hover:text-cyan"
                >
                  Search all sections →
                </button>
              )}
            </p>
          ) : (
            <ul id="ip-hs-listbox" role="listbox" aria-label="Search results" className="py-2">
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
                                <span className="search-dot h-1.5 w-1.5 rounded-full"
                                  style={{ '--dot': `var(--color-${rec.accent})` }} />
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
      )}
    </div>
  );
}
