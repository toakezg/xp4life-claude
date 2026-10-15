import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Save } from '../types'
import { apply } from '../hooks/engine'
import { loadSave } from '../hooks/rules'

const SURFACES = ['terminal', 'desktop'] as const
const NOW = Date.UTC(2026, 9, 13, 12)

const world = (on: On) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
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
  world(on)
  await $.tool.call({
    tool: 'mcp__xp4life__propose_quest',
    name: 'Polish the README',
    objective: 'A newcomer can install it from the README alone',
    category: 'build',
    tier: 'uncommon',
    tasks: ['Write install steps', 'Add a screenshot'],
  } as never)
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

const otherSessionProposes = (disk: Map<string, unknown>) => {
  const out = apply(
    loadSave(disk.get('save'), '2026-10-13'),
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