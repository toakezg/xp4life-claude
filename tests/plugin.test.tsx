import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Save } from '../types'
import { apply } from '../hooks/engine'
import { loadSave } from '../hooks/rules'

const SURFACES = ['terminal', 'desktop'] as const
const NOW = Date.UTC(2026, 9, 13, 12)

const world = (on: On) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  return clock
}

const band = (surface: (typeof SURFACES)[number]) => ({
  plugin: 'xp4life',
  surface,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 100 } as never,
})

const pane = (surface: (typeof SURFACES)[number]) => ({
  plugin: 'xp4life',
  surface,
  component: 'Pane' as const,
  requestId: 'xp4life',
  props: { title: 'XP4Life', isFocused: true, bodyColumns: 100 } as never,
})

test('a git commit through the shell earns XP and shows in the band', async ($, on) => {
  world(on)
  on('tool.call', () => ({
    result: { stdout: '[main 1a2b3c] add thing\n 1 file changed', stderr: '', interrupted: false },
  }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add thing"' } as never)
  const ui = await $.ui.mount(band('terminal'))
  // 20 for the commit and 25 for the First Mark deed it unlocked.
  expect(await ui.find({ type: 'Text', text: /\+45 commit landed/ })).toBeDefined()
})

test('plain shell commands earn nothing', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' } as never)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /commit landed/ })).toBeUndefined()
})

test('the band shows the hero and the quest on every surface', async ($, on) => {
  world(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /Wanderer/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /First Light/ })).toBeDefined()
    expect(await ui.find({ key: 'open-log' })).toBeDefined()
  }
})

test('the quest log draws every tab on every surface', async ($, on) => {
  world(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(pane(surface))
    // The open tab is session state, kept across mounts: start from the quest list.
    await ui.press({ key: 'tab-quests' })
    expect(await ui.find({ type: 'Text', text: /First Light/ })).toBeDefined()
    for (const tab of ['hero', 'deeds', 'loot', 'quests', 'titles']) {
      await ui.press({ key: `tab-${tab}` })
    }
    expect(await ui.find({ type: 'Text', text: /Vault Architect/ })).toBeDefined()
  }
})

test('a legacy title can be equipped and shows on the hero tab', async ($, on) => {
  world(on)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'tab-titles' })
  await ui.press({ key: 'equip-8' })
  await ui.press({ key: 'tab-hero' })
  expect(await ui.find({ type: 'Text', text: /Vault Architect/ })).toBeDefined()
  const top = await $.ui.mount(band('terminal'))
  expect(await top.find({ type: 'Text', text: /Vault Architect/ })).toBeDefined()
})

test('Claude can propose a quest and it lands in the log', async ($, on) => {
  const clock = world(on)
  // A proposal answers once the save is read back, two seconds on.
  const proposed = $.tool.call({
    tool: 'mcp__xp4life__propose_quest',
    name: 'Polish the README',
    objective: 'A newcomer can install it from the README alone',
    category: 'build',
    tier: 'uncommon',
    tasks: ['Write install steps', 'Add a screenshot'],
  } as never)
  await clock.advance(5_000)
  await proposed
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /Polish the README/ })).toBeDefined()
  expect(await ui.find({ key: 'abandon-q-1' })).toBeDefined()
})

// Another session (or a background job) shares the store: back it with a map the test can write to.
// `gate`, when given, holds the first read of the save after it is read, until the gate opens.
const sharedStore = (on: On, gate?: Promise<void>) => {
  const disk = new Map<string, unknown>()
  let isHeld = false
  on('store.get', async ($, e) => {
    const value = disk.get(e.key)
    if (gate && !isHeld) {
      isHeld = true
      await gate
    }
    return { value }
  })
  on('store.set', ($, e) => {
    disk.set(e.key, e.value)
    return { value: undefined }
  })
  return disk
}

// `read` is the save as the other session read it: by default, what is on disk now.
const otherSessionProposes = (disk: Map<string, unknown>, read = disk.get('save')) => {
  const out = apply(
    loadSave(read, '2026-10-13'),
    {
      kind: 'propose',
      quest: {
        name: 'Reopen the Phone Gate',
        objective: 'SSH from the phone connects again',
        category: 'system',
        tier: 'common',
        tasks: ['Connect from the phone'],
      },
    },
    NOW,
  )
  disk.set('save', out.save)
}

test('a commit here keeps a quest another session saved meanwhile', async ($, on) => {
  mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  on('tool.call', () => ({
    result: { stdout: '[main 1a2b3c] add thing\n 1 file changed', stderr: '', interrupted: false },
  }))
  // This session's copy is drawn first, then the other session saves a quest.
  await $.ui.mount(band('terminal'))
  otherSessionProposes(disk)

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add thing"' } as never)

  const saved = disk.get('save') as Save
  expect(saved.quests.some(q => q.name === 'Reopen the Phone Gate')).toBe(true)
  expect(saved.counters.commits).toBe(1)
})

test('two events landing at once in one session both count', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  // The first read of the save is held while the second event runs: the overlap Codex
  // described, where the first would then write back a save missing the second.
  let release = () => {}
  const disk = sharedStore(on, new Promise<void>(resolve => (release = resolve)))
  disk.set('save', loadSave(undefined, '2026-10-13'))
  on('tool.call', () => ({
    result: { stdout: '[main 1a2b3c] add thing\n 1 file changed', stderr: '', interrupted: false },
  }))
  const both = Promise.all([
    $.tool.call({ tool: 'Bash', command: 'git commit -m "add thing"' } as never),
    $.tool.call({ tool: 'Bash', command: 'bun test' } as never),
  ])
  await clock.advance(0)
  release()
  await both

  const saved = disk.get('save') as Save
  expect(saved.counters.commits).toBe(1)
  expect(saved.counters.testPasses).toBe(1)
})

test('two sessions saving at the same moment both keep their updates', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  on('tool.call', () => ({
    result: { stdout: '[main 1a2b3c] add thing\n 1 file changed', stderr: '', interrupted: false },
  }))
  // The other session reads the save, this one commits and writes, then the other writes
  // what it read plus its quest: the store keeps the last write, without the commit.
  const otherRead = disk.get('save')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add thing"' } as never)
  otherSessionProposes(disk, otherRead)
  expect((disk.get('save') as Save).counters.commits).toBe(0)

  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.quests.some(q => q.name === 'Reopen the Phone Gate')).toBe(true)
  expect(saved.counters.commits).toBe(1)
})

test('reading the save back adds nothing when no other session wrote over it', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  on('tool.call', () => ({
    result: { stdout: '[main 1a2b3c] add thing\n 1 file changed', stderr: '', interrupted: false },
  }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "add thing"' } as never)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.counters.commits).toBe(1)
  expect(saved.xp).toBe(45)
})

test('a proposal another session wrote over comes back under the id Claude is given', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  // Both sessions read the save and propose a quest, so both take q-1; the other writes last.
  const otherRead = disk.get('save')
  const proposed = $.tool.call({
    tool: 'mcp__xp4life__propose_quest',
    name: 'Polish the README',
    objective: 'A newcomer can install it from the README alone',
    category: 'build',
    tier: 'uncommon',
    tasks: ['Write install steps'],
  } as never)
  await clock.settle()
  otherSessionProposes(disk, otherRead)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.quests.find(q => q.name === 'Reopen the Phone Gate')?.id).toBe('q-1')
  expect(saved.quests.find(q => q.name === 'Polish the README')?.id).toBe('q-2')
  expect(String(((await proposed) as { result?: unknown }).result)).toContain('Added quest q-2.')
})

test('an older equip is not put back over a newer one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'tab-titles' })
  // The other session reads the save, this one equips, then the other writes over it.
  const otherRead = disk.get('save')
  await ui.press({ key: 'equip-7' })
  await clock.settle()
  otherSessionProposes(disk, otherRead)
  // A newer pick here, inside the read-back's two seconds, is the one that stays.
  await ui.press({ key: 'equip-8' })
  await clock.settle()
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.equipped).toBe(saved.titles[8])
  expect(saved.quests.some(q => q.name === 'Reopen the Phone Gate')).toBe(true)
})

// A test runner whose next run passes or fails as the test says.
const testRuns = (on: On) => {
  const runs = { failing: false }
  on('tool.call', () =>
    runs.failing
      ? { result: { stdout: '1 fail', stderr: '', interrupted: false }, isError: true }
      : { result: { stdout: '3 pass', stderr: '', interrupted: false } },
  )
  return runs
}

test('a failure another session wrote over still makes the next pass slay the bug', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  const runs = testRuns(on)
  // The other session reads the save, this one fails a run, then the other writes over it.
  const otherRead = disk.get('save')
  runs.failing = true
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  otherSessionProposes(disk, otherRead)
  // The fix lands inside the read-back's two seconds.
  runs.failing = false
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.counters.bugsSlain).toBe(1)
  expect(saved.counters.testPasses).toBe(1)
  expect(saved.lastTestFailed).toBe(false)
  expect(saved.quests.some(q => q.name === 'Reopen the Phone Gate')).toBe(true)
})

test('a pass another session wrote over still counts after a newer pass', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  testRuns(on)
  const otherRead = disk.get('save')
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  otherSessionProposes(disk, otherRead)
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.counters.testPasses).toBe(2)
  expect(saved.counters.bugsSlain).toBe(0)
  expect(saved.lastTestFailed).toBe(false)
})

test('a failure put back does not undo a newer pass', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  const runs = testRuns(on)
  const otherRead = disk.get('save')
  runs.failing = true
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  otherSessionProposes(disk, otherRead)
  runs.failing = false
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)
  // A later pass is a plain pass: the failure was already slain, not left standing.
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.counters.bugsSlain).toBe(1)
  expect(saved.counters.testPasses).toBe(2)
  expect(saved.lastTestFailed).toBe(false)
})

test('a failure another session already slew is not slain again here', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  disk.set('save', loadSave(undefined, '2026-10-13'))
  const runs = testRuns(on)
  runs.failing = true
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)
  // The other session passes after reading this one's failure: it slays the bug.
  disk.set('save', apply(loadSave(disk.get('save'), '2026-10-13'), { kind: 'tests', passed: true }, NOW).save)
  runs.failing = false
  await $.tool.call({ tool: 'Bash', command: 'bun test' } as never)
  await clock.advance(5_000)

  const saved = disk.get('save') as Save
  expect(saved.counters.bugsSlain).toBe(1)
  expect(saved.counters.testPasses).toBe(2)
})

test('/quest shows a quest another session saved', async ($, on) => {
  mock.clock(on, { now: NOW })
  const disk = sharedStore(on)
  on('command.run', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'tab-quests' })
  expect(await ui.find({ type: 'Text', text: /Reopen the Phone Gate/ })).toBeUndefined()

  otherSessionProposes(disk)
  await $.command.run({ command: 'quest', args: '' } as never)

  expect(await ui.find({ type: 'Text', text: /Reopen the Phone Gate/ })).toBeDefined()
})