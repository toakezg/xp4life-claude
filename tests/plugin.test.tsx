import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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