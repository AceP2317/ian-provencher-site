/**
 * story-runner — the one client script behind every scroll story (src/components/story/StoryFrame.astro).
 *
 * It finds the card being read (the one crossing the reading line, a quarter of the way down the screen,
 * or just under the panel where a narrow screen stacks the panel above the cards), steps
 * between cards on the Left and Right keys and the panel's buttons, jumps from the stage list, and
 * writes the current stage's state into the panel: any element carrying data-k shows that value,
 * data-w sets a width in percent, and data-lamp lights the child whose data-v matches.
 *
 * A story supplies only its scenes, keyed by stage id. A scene loops while its card is current, and
 * `live()` turns false the moment the reader moves on. A card with no scene of its own steps through
 * its `.sf-step` lines. With reduced motion on, the panel and the stepping still work and no scene plays;
 * with scripts off, every card already shows its finished scene and the stage list is plain links.
 */
export type State = Record<string, string | number | null>;
export type Scene = (el: HTMLElement, live: () => boolean, state: State) => Promise<void> | void;
export type StoryOpts = { scenes?: Record<string, Scene>; onStage?: (i: number, state: State, root: HTMLElement) => void };

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const fmt = (v: string | number | null | undefined) =>
  v == null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 1 })) : v;

export async function stepper(el: HTMLElement, live: () => boolean, ms = 520, sel = '.sf-step') {
  const items = [...el.querySelectorAll<HTMLElement>(sel)];
  if (!items.length) return;
  while (live()) {
    items.forEach((x) => x.classList.remove('on'));
    for (const x of items) { if (!live()) break; x.classList.add('on'); await sleep(ms); }
    if (live()) await sleep(2600);
  }
  items.forEach((x) => x.classList.add('on'));
}

export function runStory(root: HTMLElement, opts: StoryOpts = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('is-live');
  if (!reduce) root.classList.add('is-moving');
  const states: State[] = JSON.parse(root.dataset.states || '[]');
  const cards = [...root.querySelectorAll<HTMLElement>('.sf-card')];
  const packet = root.querySelector<HTMLElement>('.sf-packet');
  const list = root.querySelector<HTMLDetailsElement>('.sf-list');
  const counters = new Map<HTMLElement, { now: number; id: number }>();
  let cur = -1, run = 0, holdIo = 0;

  function count(el: HTMLElement, to: number) {
    const c = counters.get(el) ?? { now: Number(el.dataset.from ?? to) || 0, id: 0 };
    const from = c.now; c.now = to; const id = ++c.id; counters.set(el, c);
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      if (c.id !== id) return;
      const p = Math.min(1, (t - t0) / 900);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      el.textContent = fmt(Number.isInteger(to) ? Math.round(v) : Math.round(v * 10) / 10);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function paint(s: State, i: number) {
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
      const k = el.dataset.k!;
      const v = k === '_n' ? String(i + 1).padStart(2, '0') : k === '_title' ? cards[i]?.querySelector('h3')?.textContent ?? '' : s[k];
      if (v === undefined) return;
      if (el.classList.contains('sf-count') && typeof v === 'number') count(el, v); else el.textContent = fmt(v);
    });
    root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
      const v = Number(s[el.dataset.w!]);
      if (Number.isFinite(v)) el.style.width = `${Math.max(0, Math.min(100, v))}%`;
    });
    root.querySelectorAll<HTMLElement>('[data-lamp]').forEach((el) => {
      const v = String(s[el.dataset.lamp!] ?? '');
      el.querySelectorAll<HTMLElement>('[data-v]').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
    });
  }

  function activate(i: number) {
    if (i === cur || i < 0 || i >= cards.length) return;
    cur = i; const my = ++run; const card = cards[i];
    cards.forEach((c, k) => { c.classList.toggle('is-cur', k === i); c.toggleAttribute('aria-current', k === i); });
    if (packet) packet.style.top = `${card.offsetTop + 22}px`;
    root.querySelectorAll<HTMLElement>('.sf-list a[data-go]').forEach((a) => a.classList.toggle('on', Number(a.dataset.go) === i));
    root.querySelector<HTMLButtonElement>('.sf-prev')?.toggleAttribute('disabled', i === 0);
    root.querySelector<HTMLButtonElement>('.sf-next')?.toggleAttribute('disabled', i === cards.length - 1);
    paint(states[i] ?? {}, i);
    opts.onStage?.(i, states[i] ?? {}, root);
    if (reduce) return;
    const scene = card.querySelector<HTMLElement>('.sf-scene');
    const id = card.dataset.stage ?? '';
    if (!scene) return;
    const live = () => my === run;
    const play = opts.scenes?.[id];
    void (play ? play(scene, live, states[i] ?? {}) : stepper(scene, live));
  }

  // The reading line: a quarter of the way down beside the panel, or just under the panel where a
  // narrow screen stacks it above the cards, so the current card is never the one hidden beneath it.
  const panel = root.querySelector<HTMLElement>('.sf-inst');
  const cardsCol = root.querySelector<HTMLElement>('.sf-cards');
  const stacked = matchMedia('(max-width: 900px)');
  const stickTop = () => (panel ? parseFloat(getComputedStyle(panel).top) || 0 : 0);
  const line = () => (stacked.matches && panel ? stickTop() + panel.offsetHeight + 12 : innerHeight * 0.25);

  // Beside the cards, the panel sticks only while the column runs past it. When the last card is shorter
  // than the panel, the column gets the difference as tail, so at the last stage the panel stays whole.
  function fit() {
    if (!cardsCol || !panel) return;
    const last = cards[cards.length - 1];
    const tail = stacked.matches || !last ? 0 : Math.max(0, stickTop() + panel.offsetHeight + 24 - line() - last.offsetHeight);
    cardsCol.style.paddingBottom = tail ? `${Math.ceil(tail)}px` : '';
  }

  // Moving by key, button or list puts the card's top on the reading line and holds the scroll watch
  // until the scroll lands, so the cards passed on the way are never made current.
  function go(i: number) {
    if (i < 0 || i >= cards.length) return;
    activate(i);
    fit();
    const y = cards[i].getBoundingClientRect().top + scrollY - line();
    holdIo = performance.now() + (reduce ? 120 : 900);
    scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  }

  // The current card is the one the reading line crosses; in the gap between two cards it stays put.
  let queued = false;
  function watch() {
    queued = false;
    if (performance.now() < holdIo) { setTimeout(() => { if (!queued) { queued = true; requestAnimationFrame(watch); } }, holdIo - performance.now() + 16); return; }
    const y = line();
    const k = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return r.top <= y + 1 && r.bottom > y; });
    if (k >= 0) activate(k);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(watch); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { fit(); queue(); });

  root.querySelector('.sf-prev')?.addEventListener('click', () => go(cur - 1));
  root.querySelector('.sf-next')?.addEventListener('click', () => go(cur + 1));
  root.querySelectorAll<HTMLAnchorElement>('.sf-list a[data-go]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (list) list.open = false;
    go(Number(a.dataset.go));
  }));

  // The keys act only while the story is on screen and nothing that takes typing has the focus.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const r = root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    e.preventDefault();
    go(cur + (e.key === 'ArrowRight' ? 1 : -1));
  });

  activate(0);
  fit();
  return { go, current: () => cur };
}
