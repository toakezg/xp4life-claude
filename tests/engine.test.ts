import { describe, expect, test } from 'claude-code/testing'

import { apply } from '../hooks/engine'
import { PASSIVE, QUEST_XP, freshSave, levelOf, xpForLevel } from '../hooks/rules'

const NOW = Date.UTC(2026, 9, 13, 12)
const start = () => freshSave('2026-10-13')

describe('passive XP', () => {
  test('a commit pays and ticks the first quest', async () => {
    const out = apply(start(), { kind: 'commit' }, NOW)
    // 20 for the commit, then 25 for the First Mark deed.
    expect(out.save.counters.commits).toBe(1)
    expect(out.save.xp).toBe(PASSIVE.commit + 25)
    expect(out.save.achievements['first-mark']).toBeDefined()
    expect(out.save.quests[0]?.tasks[0]?.done).toBe(true)
  })

  test('passive XP stops at the daily cap', async () => {
    let save = start()
    for (let i = 0; i < 20; i += 1) save = apply(save, { kind: 'commit' }, NOW).save
    const day = Object.keys(save.passiveDayXp)[0]!
    expect(save.passiveDayXp[day]).toBe(PASSIVE.dailyCap)
  })

  test('a failing run fixed to passing slays a bug', async () => {
    let save = apply(start(), { kind: 'tests', passed: false }, NOW).save
    expect(save.lastTestFailed).toBe(true)
    const out = apply(save, { kind: 'tests', passed: true }, NOW + 1000)
    expect(out.save.counters.bugsSlain).toBe(1)
    expect(out.notes.some(n => n.includes('bug slain'))).toBe(true)
    expect(out.save.achievements['bug-slayer']).toBeDefined()
    expect(out.save.titles).toContain('Bug Slayer')
  })

  test('repeat green runs inside the cooldown pay nothing more', async () => {
    const once = apply(start(), { kind: 'tests', passed: true }, NOW).save
    const twice = apply(once, { kind: 'tests', passed: true }, NOW + 60_000).save
    expect(twice.xp).toBe(once.xp)
    expect(twice.counters.testPasses).toBe(2)
  })
})

describe('quests', () => {
  test('claiming First Light pays its tier and opens the next step', async () => {
    let save = apply(start(), { kind: 'commit' }, NOW).save
    save = apply(save, { kind: 'tests', passed: true }, NOW).save
    const before = save.xp
    const out = apply(save, { kind: 'claim', questId: 'awakening-1', roll: 0.99, pick: 0 }, NOW)
    expect(out.error).toBeUndefined()
    // Quest XP plus the Quest Taker deed.
    expect(out.save.xp).toBe(before + QUEST_XP.common + 25)
    expect(out.save.quests.map(q => q.id)).toContain('awakening-2')
  })

  test('an unfinished quest cannot be claimed', async () => {
    const out = apply(start(), { kind: 'claim', questId: 'awakening-1', roll: 0, pick: 0 }, NOW)
    expect(out.error).toBeDefined()
    expect(out.save.xp).toBe(0)
  })

  test('a lucky roll drops loot', async () => {
    let save = apply(start(), { kind: 'commit' }, NOW).save
    save = apply(save, { kind: 'tests', passed: true }, NOW).save
    const out = apply(save, { kind: 'claim', questId: 'awakening-1', roll: 0, pick: 0 }, NOW)
    expect(out.save.inventory).toHaveLength(1)
  })

  test('Claude proposes by tier, never legendary, and cannot tick auto tasks', async () => {
    const legendary = apply(start(), { kind: 'propose', quest: { name: 'Big', objective: 'x', category: 'build', tier: 'legendary', tasks: ['a'] } }, NOW)
    expect(legendary.error).toBeDefined()

    const out = apply(start(), { kind: 'propose', quest: { name: 'Ship the README', objective: 'Docs exist', category: 'build', tier: 'uncommon', tasks: ['Write it', 'Commit it'] } }, NOW)
    expect(out.questId).toBe('q-1')
    const auto = apply(out.save, { kind: 'task-done', questId: 'awakening-1', task: 1, evidence: 'did it' }, NOW)
    expect(auto.error).toBeDefined()
    const noEvidence = apply(out.save, { kind: 'task-done', questId: 'q-1', task: 1, evidence: ' ' }, NOW)
    expect(noEvidence.error).toBeDefined()
    const done = apply(out.save, { kind: 'task-done', questId: 'q-1', task: 1, evidence: 'README.md written' }, NOW)
    expect(done.save.quests.find(q => q.id === 'q-1')?.tasks[0]?.done).toBe(true)
  })
})

test('the level curve', async () => {
  expect(levelOf(0)).toBe(1)
  expect(levelOf(99)).toBe(1)
  expect(levelOf(100)).toBe(2)
  expect(levelOf(xpForLevel(10))).toBe(10)
})