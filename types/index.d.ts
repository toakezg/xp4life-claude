export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

/** Work the plugin sees happen, which can tick a quest task on its own. */
export type Trigger =
  | 'commit'
  | 'test-pass'
  | 'bug-slain'
  | 'new-file'
  | 'quest-proposed'
  | 'claude-quest-done'

export type QuestTask = {
  text: string
  done: boolean
  trigger?: Trigger
  need?: number
  have?: number
  evidence?: string
}

export type Quest = {
  id: string
  name: string
  tier: Tier
  category: string
  objective: string
  tasks: QuestTask[]
  status: 'active' | 'completed' | 'abandoned'
  source: 'starter' | 'claude'
  chain?: string
  createdOn: string
  completedOn?: string
}

export type Gain = { at: string; xp: number; reason: string }

export type LootItem = {
  id: string
  name: string
  tier: string
  cls: string
  notes: string
  /** Raster cells, ART_COLUMNS x ART_ROWS. */
  art: string
}

export type Counters = {
  commits: number
  testPasses: number
  bugsSlain: number
  filesForged: number
  questsDone: number
  claudeQuestsDone: number
}

export type Save = {
  version: 1
  startedOn: string
  xp: number
  /** XP earned per local day (YYYY-MM-DD), for streaks and the heatmap. */
  dayXp: Record<string, number>
  /** Passive XP per day, held to the daily cap. */
  passiveDayXp: Record<string, number>
  counters: Counters
  /** Achievement id -> day unlocked. */
  achievements: Record<string, string>
  titles: string[]
  equipped: string
  inventory: { id: string; on: string }[]
  quests: Quest[]
  log: Gain[]
  lastTestFailed: boolean
  lastTestRewardAt: number
  nextQuestId: number
}

export type Tab = 'quests' | 'hero' | 'deeds' | 'titles' | 'loot'

declare module 'claude-code' {
  interface PluginState {
    xp4life: {
      save: Save
      tab: Tab
      lootPick: number
      flash: Gain | null
    }
  }
}
