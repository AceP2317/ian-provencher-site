/**
 * Selected work — two hand-authored, public-safe rankings. The AI list judges each build only on how
 * the AI in it is directed, tagged by the kind of AI role it proves; the second list is the builds
 * where a supply-chain problem and an AI method meet. A pick backed by a build card takes its name,
 * description and default links from that card by id, so nothing here re-types a card; a pick with no
 * build behind it carries its own title. A pick naming a card that is not published stops the build.
 */
import { tools } from './tools';
import staple from './staple.generated.json';

export type AiRole = 'model' | 'agent' | 'built' | 'governs';

export const AI_ROLE_LABEL: Record<AiRole, string> = {
  model: 'A model works inside the job',
  agent: 'An AI agent runs the job',
  built: 'Built by directing AI · rule-based',
  governs: 'Governs the AI itself',
};

export type RoleKind = 'adoption' | 'products' | 'analysis' | 'automation';

export const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  adoption: 'Adoption and training',
  products: 'AI programs and products',
  analysis: 'AI business analysis',
  automation: 'Automation',
};

interface PickLink { label: string; href: string }
type Source = { id: string; title?: never; description?: never } | { title: string; id?: never; description?: string };
type Pick<T> = Source & T & { evidence: string; links?: PickLink[] };

const AI_PICKS: Pick<{ kinds: RoleKind[] }>[] = [
  {
    id: 'tool-job-board',
    kinds: ['products', 'automation'],
    evidence: 'Claude scored 680 postings against my written rubric in October. Only a job confirmed open on the employer’s own site is published: on the day that rule shipped, the check found 7 of 9 known-live postings and opened none of 5 known-closed ones. A cheaper model ran beside it for a week, agreed on 92% of its calls, and dropped 12 of the 34 postings the stronger one kept, so the stronger one stayed.',
  },
  {
    title: 'My build rules, inside an AI platform’s own agent',
    kinds: ['adoption', 'products'],
    evidence: 'A fingerprinted pack of my build rules loads into the platform’s own agent, so every app it builds starts from my template and my checks. Its self-test refused 13 of 13 planted faults. On a real rebuild, all 26 shared files matched the pack byte for byte and 23 guards passed. My scheduled tasks there ran as the platform’s own agent.',
  },
  {
    title: 'Testing the instructions my agents follow',
    kinds: ['analysis'],
    evidence: 'Given a vague answer to “what counts as done?”, a planning step demanded a checkable finish in 7 of 9 runs with one instruction, against 1 of 9 with it removed (one-sided Fisher p = 0.008). The same instruction asked for a giving-up point in 6 of 9 runs, against 0 of 9 for the old wording. A control input that should not move drew 0 of 3.',
    links: [{ label: 'See the setup', href: '/claude-setup/' }],
  },
  {
    title: 'Choosing models by measured accuracy',
    kinds: ['products', 'analysis'],
    evidence: 'A cheaper model tied the stronger one on two benchmark tests, so my search helpers moved to it. In real use its answers fully held 21 of 47 times, against 73 of 95 before. I moved them back and accepted about three times the usage per search.',
  },
  {
    title: 'Fixed rules where a model cannot be trusted',
    kinds: ['analysis'],
    evidence: 'A change-order tracker read engineering PDFs with a chat model, and a planner cannot see what a model misread. I had that reader replaced with the rule-based one my other change-order tools share. It re-read all 10 change orders to the same 419 lines the old app held, and a checker holds each order to its PDF line for line.',
  },
  {
    id: 'tool-headless-agents',
    kinds: ['automation'],
    evidence: 'One of the agents produces and publishes my podcast. A week’s trial cut their cost per turn from $0.137 to $0.079, before both moved to a smaller model on their own capped keys. Their acceptance suite passed 340 of 340, and a judge model’s scores count only after it rates an empty answer low and a reference answer high.',
    links: [{ label: 'Listen to the podcast', href: '/podcast/' }],
  },
  {
    id: 'tool-grunts',
    kinds: ['products'],
    evidence: 'Both effort levels passed 33 of 33 errands. The lower one cost $0.0030 a run against $0.0033 and finished in 12 seconds against 14, so the assistants run at the lower one.',
  },
  {
    id: 'tool-intent-lock-kit',
    kinds: ['adoption', 'products'],
    evidence: 'On 12 October 2026, the build that planned the kit’s first write-up read 113.0 million tokens by handing off to a fresh session, against 165.5 million had it stayed in the planning window: 31.7% fewer, in one measured session.',
  },
  {
    title: 'Carrying AI into a manufacturer’s daily work',
    kinds: ['adoption'],
    evidence: 'One of 12 founding members of the manufacturer’s AI champions group, and one of 14 on its global supply-chain AI team, the only one from a plant. I teach with working tools: my October session closed on one container followed through the Container Tracker below.',
  },
];

const PICKS: Pick<{ role: AiRole }>[] = [
  {
    id: 'tool-confirmation-forecaster',
    role: 'model',
    evidence: 'On a held-out week it never saw, it flagged 98.7% of the next week’s misses, and 87.3% of its top-63 worklist was right. Materials that simply keep failing account for 66% on their own, and that floor is reported rather than credited to the model. A question panel answers in plain English by having Claude call the engine’s own tools.',
    links: [{ label: 'Open the public twin', href: 'https://demo.appliediqsolutions.com' }],
  },
  {
    id: 'tool-confirmation-outlook',
    role: 'model',
    evidence: 'Open it now: a fictional manufacturer and synthetic data. Its Ask tab has Claude answer by calling the forecaster’s own tools, and the same tools serve other AI clients over MCP. At its last change, on 14 July 2026, it held a 42-check gate, which fails the build if the engine cannot recover the pattern planted in the data.',
  },
  {
    title: 'Staple: which parts the truck carries, and who takes the call',
    role: 'model',
    evidence: 'Open it now. It runs on 160,000 repair jobs I invented over three years, so it shows the method and never a result. Every method learns from the history before the last 92 days and is scored on those days as if they had not happened yet. Every gain carries a control built to take it away: shuffled history drops the parts predictor back to the national top-parts list, shuffled technician skills drop the dispatch rule below the one that ignores skills, and shuffled AI answers lose the AI step’s gain. Each check plants a fault it must catch, and one clones the public repository fresh and runs everything there.',
    description: `It opens on the next day’s plan: which technician takes each call, what each truck loads tonight, and a to-do list for each team. For a booked repair, it ranks the likely parts by counting what fixed past jobs at three levels: the same model family and problem, the product type and problem, then the product type alone, so a new model with thin history leans on the wider group. Each night it loads every truck from tomorrow’s calls, keeping a part only while the second visits it saves outweigh the cost of moving and holding it. Each part on a list is marked as aboard, overnight from a distribution center, on a truck nearby, back-ordered, or locked to a certified technician. Claude Haiku 5.5 turns the customer’s own words into a problem code with a confidence, and asks one follow-up question when it is unsure. Dispatch replays every held-back day with sick calls and breakdowns, sending each call to the technician with the lowest expected cost of drive time, repair time and a second visit. ${staple.sentence} Nothing is installed beyond Python.`,
    links: [{ label: 'Open the live report', href: 'https://acep2317.github.io/staple/' }, { label: 'Read the code', href: 'https://github.com/AceP2317/staple' }],
  },
  {
    id: 'tool-container-tracker',
    role: 'agent',
    evidence: 'It compares each forwarder report with the one before it, container by container, and scores the forwarder’s ETAs against real port arrivals: on 31 October 2026 they missed by a median of 5 days across 6 confirmed port calls. On its first platform an AI agent triggered the port read every three hours and reported whether the app answered. I presented it at an internal AI-adoption session.',
  },
  {
    id: 'tool-eco-translator',
    role: 'built',
    evidence: 'The bill of materials decides scope, not the document: one 183-line, 28-page change table resolved to the 25 purchased parts it actually moves. It was tested on 7 real change orders. Its sibling tracker dropped a chat-model PDF reader for the one rule-based reader all three change-order tools share.',
  },
  {
    id: 'tool-co-implementation-planner',
    role: 'built',
    evidence: 'Picks the cut-over day so the old part runs out with the least scrap, from the change order, the BOM explosion, the production plan and the stock. Its tests hold it to figures measured by hand before any code existed.',
  },
  {
    id: 'tool-demand-supply-delta',
    role: 'built',
    evidence: 'Reproduces all 13 weekly totals of the report planners already trusted. Its test suite catches 10 of 10 deliberately planted engine faults, so a pass means something.',
  },
  {
    id: 'tool-staging-triage-console',
    role: 'built',
    evidence: 'Its first run caught a discrepancy of more than 40,000 units within minutes, and it was rolled out across the plant. Its tests hold the engine to an independent Python recomputation.',
  },
  {
    id: 'tool-production-plan-churn',
    role: 'built',
    evidence: 'Compares quantities per material per week, never order numbers, because SAP renumbers orders. On 6 November 2026 it held 122 tests with 26 planted defects. On 20 September 2026, 11 real export pairs agreed with an independent recomputation.',
  },
  {
    id: 'tool-claude-home',
    role: 'governs',
    evidence: 'Its guards refused 142 agent tool calls in the week to 31 October 2026. In a controlled test, a planning step given a vague answer to “what counts as done?” demanded a checkable finish in 7 of 9 runs, against 1 of 9 with that instruction removed. 341 of 403 recorded kinds of mistake had not come back when audited on 11 September 2026.',
    links: [{ label: 'See the setup', href: '/claude-setup/' }],
  },
];

interface Shown { name: string; description?: string; evidence: string; links: PickLink[] }

function show<T extends object>(p: Pick<T>): Shown {
  if (p.title) return { name: p.title, description: p.description, evidence: p.evidence, links: p.links ?? [] };
  const tool = tools.find((t) => t.id === p.id && t.status !== 'retired');
  if (!tool) throw new Error(`work: ${p.id} has no published, running build card`);
  return { name: tool.name, description: tool.description, evidence: p.evidence, links: p.links ?? tool.links };
}

export interface AiWorkPick extends Shown { kinds: RoleKind[] }
export interface WorkPick extends Shown { role: AiRole }

export const aiPicks: AiWorkPick[] = AI_PICKS.map((p) => ({ ...show(p), kinds: p.kinds }));
export const workPicks: WorkPick[] = PICKS.map((p) => ({ ...show(p), role: p.role }));
