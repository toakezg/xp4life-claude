import type { Counters, Quest, Save, Tier } from '../types'

/** WoW-style item colors, carried over from XP4Life's rarity table. */
export const TIER_COLOR: Record<string, string> = {
  common: '#c8c8c8',
  uncommon: '#1eff00',
  rare: '#3b8eea',
  epic: '#a335ee',
  legendary: '#ff8000',
  mythic: '#e6cc80',
}

export const TIER_ORDER: Tier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

/** What a claimed quest pays. Claude picks a tier, never a number. */
export const QUEST_XP: Record<Tier, number> = {
  common: 50,
  uncommon: 120,
  rare: 300,
  epic: 700,
  legendary: 1500,
  mythic: 3000,
}

export const ACHIEVEMENT_XP: Record<Tier, number> = {
  common: 25,
  uncommon: 75,
  rare: 200,
  epic: 500,
  legendary: 1000,
  mythic: 2000,
}

/** Chance a claimed quest drops loot. */
export const LOOT_CHANCE: Record<Tier, number> = {
  common: 0.15,
  uncommon: 0.3,
  rare: 0.55,
  epic: 0.9,
  legendary: 1,
  mythic: 1,
}

/**
 * Passive XP: proof the plugin sees happen. Held to a daily cap so a busy
 * session can't inflate the world; quests and achievements are uncapped.
 */
export const PASSIVE = {
  commit: 20,
  testPass: 10,
  bugSlain: 25,
  newFile: 3,
  /** A passing test run pays again only after this long, unless it fixes a failure. */
  testCooldownMs: 10 * 60 * 1000,
  dailyCap: 150,
}

/** Total XP needed to reach `level`: 0, 100, 300, 600, 1000, ... */
export const xpForLevel = (level: number) => 50 * (level - 1) * level

export const levelOf = (xp: number) => {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level += 1
  return level
}

export const dayOf = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const daysBefore = (ms: number, n: number) => dayOf(ms - n * 86_400_000)

/** Consecutive days with XP, counting back from today (or yesterday, so today isn't lost yet). */
export const streakOf = (save: Save, now: number) => {
  let back = (save.dayXp[dayOf(now)] ?? 0) > 0 ? 0 : 1
  let streak = 0
  while ((save.dayXp[daysBefore(now, back)] ?? 0) > 0) {
    streak += 1
    back += 1
  }
  return streak
}

export const NEW_TITLE = 'Wanderer'

/** Titles from the original XP4Life vault, carried into the fresh world as a legacy save. */
export const LEGACY_TITLES = [
  'A Ready Man',
  'Apprentice Cache',
  'Builder I',
  'Forge Operator',
  'Signal Runner',
  'Toolsmith',
  'Trail Initiate',
  'Vault Architect',
]

export type Achievement = {
  id: string
  name: string
  tier: Tier
  text: string
  /** Rough share of people who ever do this: everyone, then people who code. */
  global: string
  field: string
  title?: string
  isMet: (c: Counters, level: number, streak: number, save: Save) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-mark', name: 'First Mark', tier: 'common', text: 'Land your first commit with Claude.', global: '~25%', field: '~95%', isMet: c => c.commits >= 1 },
  { id: 'green-light', name: 'Green Light', tier: 'common', text: 'Run a passing test suite.', global: '~15%', field: '~80%', isMet: c => c.testPasses >= 1 },
  { id: 'bug-slayer', name: 'Bug Slayer', tier: 'uncommon', text: 'Take a failing test run to passing.', global: '~10%', field: '~60%', title: 'Bug Slayer', isMet: c => c.bugsSlain >= 1 },
  { id: 'quest-taker', name: 'Quest Taker', tier: 'common', text: 'Claim your first quest.', global: '~30%', field: '~50%', isMet: c => c.questsDone >= 1 },
  { id: 'awakened', name: 'Awakened', tier: 'rare', text: 'Finish The Awakening questline.', global: '~3%', field: '~15%', title: 'the Awakened', isMet: (_c, _l, _s, save) => save.quests.some(q => q.id === 'awakening-3' && q.status === 'completed') },
  { id: 'steady-hand', name: 'Steady Hand', tier: 'uncommon', text: 'Land 25 commits.', global: '~8%', field: '~70%', title: 'Steady Hand', isMet: c => c.commits >= 25 },
  { id: 'forger', name: 'Forger', tier: 'uncommon', text: 'Create 25 new files.', global: '~8%', field: '~65%', isMet: c => c.filesForged >= 25 },
  { id: 'exterminator', name: 'Exterminator', tier: 'rare', text: 'Slay 10 bugs.', global: '~2%', field: '~25%', title: 'Exterminator', isMet: c => c.bugsSlain >= 10 },
  { id: 'adventurer', name: 'Adventurer', tier: 'rare', text: 'Claim 10 quests.', global: '~3%', field: '~12%', title: 'Adventurer', isMet: c => c.questsDone >= 10 },
  { id: 'party-of-two', name: 'Party of Two', tier: 'uncommon', text: 'Complete a quest Claude proposed.', global: '~5%', field: '~20%', isMet: c => c.claudeQuestsDone >= 1 },
  { id: 'kindled', name: 'Kindled', tier: 'uncommon', text: 'Hold a 3-day streak.', global: '~20%', field: '~40%', isMet: (_c, _l, s) => s >= 3 },
  { id: 'unbroken', name: 'Unbroken', tier: 'rare', text: 'Hold a 7-day streak.', global: '~5%', field: '~15%', title: 'the Unbroken', isMet: (_c, _l, s) => s >= 7 },
  { id: 'relentless', name: 'Relentless', tier: 'epic', text: 'Hold a 30-day streak.', global: '~0.5%', field: '~3%', title: 'the Relentless', isMet: (_c, _l, s) => s >= 30 },
  { id: 'rising', name: 'Rising', tier: 'uncommon', text: 'Reach level 5.', global: '~10%', field: '~30%', title: 'Journeyman', isMet: (_c, l) => l >= 5 },
  { id: 'veteran', name: 'Veteran', tier: 'epic', text: 'Reach level 15.', global: '~1%', field: '~5%', title: 'Veteran', isMet: (_c, l) => l >= 15 },
]

type StarterTask = Omit<Quest['tasks'][number], 'done'>
type Starter = Omit<Quest, 'tasks' | 'status' | 'createdOn' | 'source'> & { tasks: StarterTask[] }

/** The starter questline: each step opens when the one before is claimed. */
export const AWAKENING: Starter[] = [
  {
    id: 'awakening-1',
    name: 'First Light',
    tier: 'common',
    category: 'build',
    chain: 'The Awakening',
    objective: 'Prove the forge is lit: ship something small and prove it works.',
    tasks: [
      { text: 'Land a commit', trigger: 'commit' },
      { text: 'Run a passing test suite', trigger: 'test-pass' },
    ],
  },
  {
    id: 'awakening-2',
    name: 'Proof of Work',
    tier: 'uncommon',
    category: 'build',
    chain: 'The Awakening',
    objective: 'Real work leaves a trail. Leave one.',
    tasks: [
      { text: 'Slay a bug: a failing test run, fixed, then passing', trigger: 'bug-slain' },
      { text: 'Forge new files', trigger: 'new-file', need: 3 },
      { text: 'Land commits', trigger: 'commit', need: 3 },
    ],
  },
  {
    id: 'awakening-3',
    name: 'Chart the Road',
    tier: 'rare',
    category: 'system',
    chain: 'The Awakening',
    objective: 'Turn a real goal into a quest, and see it through with your companion.',
    tasks: [
      { text: 'Have Claude propose a quest for something you actually want done', trigger: 'quest-proposed' },
      { text: 'Claim a quest Claude proposed', trigger: 'claude-quest-done' },
    ],
  },
]

export const startQuest = (s: Starter, today: string): Quest => ({
  ...s,
  tasks: s.tasks.map(t => ({ ...t, done: false, ...(t.need ? { have: 0 } : {}) })),
  status: 'active',
  source: 'starter',
  createdOn: today,
})

export const freshSave = (today: string): Save => ({
  version: 1,
  startedOn: today,
  xp: 0,
  dayXp: {},
  passiveDayXp: {},
  counters: { commits: 0, testPasses: 0, bugsSlain: 0, filesForged: 0, questsDone: 0, claudeQuestsDone: 0 },
  achievements: {},
  titles: [NEW_TITLE, ...LEGACY_TITLES],
  equipped: NEW_TITLE,
  inventory: [],
  quests: [startQuest(AWAKENING[0]!, today)],
  log: [],
  lastTestFailed: false,
  lastTestRewardAt: 0,
  nextQuestId: 1,
})

export const isQuestReady = (q: Quest) => q.status === 'active' && q.tasks.every(t => t.done)

/** Commands that count as landing a commit or running tests. */
export const COMMIT = /\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+commit\b(?![^|;&]*--dry-run)/
export const TESTS =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|pytest|vitest|jest|cargo\s+test|go\s+test|dotnet\s+test|mvn\s+(?:\S+\s+)*test|gradlew?\s+test|python\s+-m\s+(?:unittest|pytest)|claude\s+plugin\s+test|Invoke-Pester|deno\s+test|mix\s+test|rspec|phpunit)\b/i