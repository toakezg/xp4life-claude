import type { Gain, Quest, Save, Tier, Trigger } from '../types'
import { LOOT } from './loot'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_XP,
  AWAKENING,
  LOOT_CHANCE,
  PASSIVE,
  QUEST_XP,
  TIER_ORDER,
  dayOf,
  isQuestReady,
  levelOf,
  startQuest,
  streakOf,
} from './rules'

export type ProposedQuest = {
  name: string
  objective: string
  category: string
  tier: Tier
  tasks: string[]
}

export type GameEvent =
  | { kind: 'commit' }
  | { kind: 'tests'; passed: boolean }
  | { kind: 'new-file' }
  | { kind: 'claim'; questId: string; roll: number; pick: number }
  | { kind: 'propose'; quest: ProposedQuest }
  | { kind: 'task-done'; questId: string; task: number; evidence: string }
  | { kind: 'abandon'; questId: string }
  | { kind: 'equip'; title: string }

export type Outcome = {
  save: Save
  /** Lines worth a toast, in order. */
  notes: string[]
  /** The event's total gain, for the band. */
  flash?: Gain
  error?: string
  questId?: string
}

/** Tiers Claude may propose; legendary and above are earned, not assigned. */
export const PROPOSABLE: Tier[] = ['common', 'uncommon', 'rare', 'epic']
export const MAX_CLAUDE_QUESTS = 6

/** Applies one event to the save. Pure: the same save, event and time give the same outcome. */
export const apply = (before: Save, event: GameEvent, now: number): Outcome => {
  const save: Save = JSON.parse(JSON.stringify(before))
  const out: Outcome = { save, notes: [] }
  const today = dayOf(now)

  const gain = (xp: number, reason: string, isPassive: boolean) => {
    let granted = xp
    if (isPassive) {
      const used = save.passiveDayXp[today] ?? 0
      granted = Math.max(0, Math.min(xp, PASSIVE.dailyCap - used))
      if (granted < xp && used < PASSIVE.dailyCap) {
        out.notes.push(`Daily passive cap reached (${PASSIVE.dailyCap} XP). Quests still pay.`)
      }
      if (granted === 0) return
      save.passiveDayXp[today] = used + granted
    }
    const levelBefore = levelOf(save.xp)
    save.xp += granted
    save.dayXp[today] = (save.dayXp[today] ?? 0) + granted
    const entry = { at: new Date(now).toISOString(), xp: granted, reason }
    save.log = [entry, ...save.log].slice(0, 50)
    // The band shows one line per event: its whole gain, under the reason that started it.
    out.flash = out.flash ? { ...out.flash, xp: out.flash.xp + granted } : entry
    out.notes.push(`+${granted} XP  ${reason}`)
    const levelAfter = levelOf(save.xp)
    if (levelAfter > levelBefore) out.notes.push(`LEVEL UP!  You are now level ${levelAfter}.`)
  }

  const progress = (trigger: Trigger) => {
    for (const quest of save.quests) {
      if (quest.status !== 'active') continue
      const wasReady = isQuestReady(quest)
      for (const task of quest.tasks) {
        if (task.done || task.trigger !== trigger) continue
        task.have = (task.have ?? 0) + 1
        if (task.have >= (task.need ?? 1)) task.done = true
      }
      if (!wasReady && isQuestReady(quest)) {
        out.notes.push(`Quest complete: ${quest.name}. Claim it in /quest.`)
      }
    }
  }

  /** Unlocks every achievement now met; achievement XP can level you into the next one. */
  const settle = () => {
    for (let pass = 0; pass < ACHIEVEMENTS.length; pass += 1) {
      const level = levelOf(save.xp)
      const streak = streakOf(save, now)
      const fresh = ACHIEVEMENTS.find(
        a => !save.achievements[a.id] && a.isMet(save.counters, level, streak, save),
      )
      if (!fresh) return
      save.achievements[fresh.id] = today
      out.notes.push(`Achievement unlocked: ${fresh.name} (${fresh.tier})`)
      gain(ACHIEVEMENT_XP[fresh.tier], `deed: ${fresh.name}`, false)
      if (fresh.title && !save.titles.includes(fresh.title)) {
        save.titles.push(fresh.title)
        out.notes.push(`New title: ${fresh.title}`)
      }
    }
  }

  const findQuest = (id: string): Quest | undefined => save.quests.find(q => q.id === id)

  switch (event.kind) {
    case 'commit': {
      save.counters.commits += 1
      gain(PASSIVE.commit, 'commit landed', true)
      progress('commit')
      break
    }
    case 'tests': {
      if (!event.passed) {
        save.lastTestFailed = true
        break
      }
      const wasFailing = save.lastTestFailed
      save.lastTestFailed = false
      save.counters.testPasses += 1
      if (wasFailing) {
        save.counters.bugsSlain += 1
        gain(PASSIVE.bugSlain, 'bug slain', true)
        progress('bug-slain')
      } else if (now - save.lastTestRewardAt >= PASSIVE.testCooldownMs) {
        gain(PASSIVE.testPass, 'tests passing', true)
      }
      save.lastTestRewardAt = now
      progress('test-pass')
      break
    }
    case 'new-file': {
      save.counters.filesForged += 1
      gain(PASSIVE.newFile, 'file forged', true)
      progress('new-file')
      break
    }
    case 'claim': {
      const quest = findQuest(event.questId)
      if (!quest || !isQuestReady(quest)) {
        out.error = `Quest ${event.questId} is not ready to claim.`
        return out
      }
      quest.status = 'completed'
      quest.completedOn = today
      save.counters.questsDone += 1
      gain(QUEST_XP[quest.tier], `quest: ${quest.name}`, false)
      if (quest.source === 'claude') {
        save.counters.claudeQuestsDone += 1
        progress('claude-quest-done')
      }
      if (event.roll < LOOT_CHANCE[quest.tier]) {
        const ceiling = TIER_ORDER.indexOf(quest.tier) >= TIER_ORDER.indexOf('rare') ? 99 : TIER_ORDER.indexOf('epic')
        const owned = new Set(save.inventory.map(i => i.id))
        const pool = LOOT.filter(i => !owned.has(i.id) && TIER_ORDER.indexOf(i.tier as Tier) <= ceiling)
        const item = pool[Math.floor(event.pick * pool.length)]
        if (item) {
          save.inventory.push({ id: item.id, on: today })
          out.notes.push(`Loot! ${item.name} (${item.tier})`)
        }
      }
      const step = AWAKENING.findIndex(s => s.id === quest.id)
      const nextStep = step >= 0 ? AWAKENING[step + 1] : undefined
      if (nextStep && !findQuest(nextStep.id)) {
        save.quests.push(startQuest(nextStep, today))
        out.notes.push(`New quest: ${nextStep.name}`)
      }
      break
    }
    case 'propose': {
      const q = event.quest
      const open = save.quests.filter(x => x.source === 'claude' && x.status === 'active').length
      if (open >= MAX_CLAUDE_QUESTS) {
        out.error = `The quest log already holds ${open} of Claude's quests; finish or abandon one first.`
        return out
      }
      if (!PROPOSABLE.includes(q.tier)) {
        out.error = `Tier must be one of ${PROPOSABLE.join(', ')}.`
        return out
      }
      const tasks = q.tasks.map(t => t.trim()).filter(Boolean).slice(0, 8)
      if (!q.name.trim() || tasks.length === 0) {
        out.error = 'A quest needs a name and at least one task.'
        return out
      }
      const id = `q-${save.nextQuestId}`
      save.nextQuestId += 1
      save.quests.push({
        id,
        name: q.name.trim().slice(0, 60),
        tier: q.tier,
        category: (q.category || 'general').trim().slice(0, 24),
        objective: q.objective.trim().slice(0, 200),
        tasks: tasks.map(text => ({ text: text.slice(0, 120), done: false })),
        status: 'active',
        source: 'claude',
        createdOn: today,
      })
      out.questId = id
      out.notes.push(`New quest from Claude: ${q.name.trim()} (${q.tier}, +${QUEST_XP[q.tier]} XP)`)
      progress('quest-proposed')
      break
    }
    case 'task-done': {
      const quest = findQuest(event.questId)
      const task = quest?.tasks[event.task - 1]
      if (!quest || quest.status !== 'active' || !task) {
        out.error = `No active quest ${event.questId} with task ${event.task}.`
        return out
      }
      if (task.trigger) {
        out.error = 'That task ticks itself when the work happens; it cannot be marked by hand.'
        return out
      }
      if (!event.evidence.trim()) {
        out.error = 'Evidence is required: say what was actually done.'
        return out
      }
      const wasReady = isQuestReady(quest)
      task.done = true
      task.evidence = event.evidence.trim().slice(0, 200)
      out.notes.push(`Task done: ${task.text}`)
      if (!wasReady && isQuestReady(quest)) out.notes.push(`Quest complete: ${quest.name}. Claim it in /quest.`)
      break
    }
    case 'abandon': {
      const quest = findQuest(event.questId)
      if (!quest || quest.source !== 'claude' || quest.status !== 'active') {
        out.error = 'Only active quests Claude proposed can be abandoned.'
        return out
      }
      quest.status = 'abandoned'
      out.notes.push(`Abandoned: ${quest.name}`)
      break
    }
    case 'equip': {
      if (!save.titles.includes(event.title)) {
        out.error = `Title not unlocked: ${event.title}`
        return out
      }
      save.equipped = event.title
      break
    }
  }

  settle()
  return out
}