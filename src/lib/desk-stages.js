// A desk job's stages, in the order an application moves (2026-11-09). The desk's worker and the console
// both read this one list, so a stage can never exist in one and be missing from the other. An ended stage
// leaves the console's open list.
export const STAGES = [
  { id: 'new', label: 'New', dot: 'bg-warn' },
  { id: 'drafted', label: 'Drafts ready', dot: 'bg-accent' },
  { id: 'applied', label: 'Applied', dot: 'bg-up' },
  { id: 'interview', label: 'Interview', dot: 'bg-up' },
  { id: 'offer', label: 'Offer', dot: 'bg-up' },
  { id: 'rejected', label: 'Rejected', dot: 'bg-down', ended: true },
  { id: 'closed', label: 'Closed', dot: 'bg-line', ended: true },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageOf = (id) => STAGES.find((s) => s.id === id);
export const isEnded = (id) => !!stageOf(id)?.ended;
