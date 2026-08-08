// The SSR-safe static fallback for the setup exhibit — rendered on the server
// (so crawlers + no-JS + no-WebGL see the full workflow) and used whenever the 3D
// scene isn't available. A labeled operator → engine + layers → outputs flow;
// each station is a real button that drives the same shared inspector.

const ACCENT_VAR = {
  amber: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  indigo: 'var(--color-indigo)',
  green: 'var(--color-green)',
  violet: 'var(--color-violet)',
};

function StationCard({ s, on, selected, onSelect, big }) {
  const color = ACCENT_VAR[s.accent] || 'var(--color-ink-faint)';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`panel group flex w-full flex-col gap-1 p-4 text-left transition-colors hover:border-line-2 ${big ? 'sm:p-5' : ''}`}
      style={{
        borderColor: selected ? color : undefined,
        opacity: on ? 1 : 0.55,
      }}
    >
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="mono-label" style={{ color }}>{s.kicker}</span>
      </span>
      <span className={`font-display font-semibold tracking-tight text-ink ${big ? 'text-lg' : 'text-sm'}`}>{s.label}</span>
      <span className="text-xs leading-relaxed text-ink-muted">{s.tagline}</span>
    </button>
  );
}

export default function Fallback({ c }) {
  const { setup, stationOn, select, selected } = c;
  const zone = (z) => setup.stations.filter((s) => s.zone === z);
  const card = (s, big) => (
    <StationCard
      key={s.id}
      s={s}
      big={big}
      on={stationOn(s.id)}
      selected={selected === s.id}
      onSelect={() => select(s.id)}
    />
  );

  return (
    <div className="panel setup-fallback p-4 sm:p-5">
      <div className="grid w-full items-start gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,0.8fr)]">
        {/* Operator */}
        <div className="flex flex-col gap-2">
          <p className="mono-label text-ink-faint">Direction in</p>
          {zone('operator').map((s) => card(s, true))}
        </div>

        {/* Engine + operating layers */}
        <div className="flex flex-col gap-3">
          <p className="mono-label text-ink-faint">The engine & its operating system</p>
          {zone('core').map((s) => card(s, true))}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {zone('layer').map((s) => card(s, false))}
          </div>
        </div>

        {/* Outputs */}
        <div className="flex flex-col gap-2">
          <p className="mono-label text-ink-faint">What ships</p>
          {zone('output').map((s) => card(s, true))}
        </div>
      </div>
    </div>
  );
}
