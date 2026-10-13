import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Save, Tab, Tier } from '../types'
import { MAX_CLAUDE_QUESTS, PROPOSABLE, apply } from './engine'
import type { GameEvent } from './engine'
import { ART_COLUMNS, ART_ROWS, EMBLEM, EMBLEM_COLUMNS, EMBLEM_ROWS, LOOT } from './loot'
import {
  ACHIEVEMENTS,
  COMMIT,
  LEGACY_TITLES,
  PASSIVE,
  QUEST_XP,
  TESTS,
  TIER_COLOR,
  dayOf,
  freshSave,
  isQuestReady,
  levelOf,
  streakOf,
  xpForLevel,
} from './rules'

const PANE = 'xp4life'
const GOLD = '#ffc93c'
const TABS: { id: Tab; label: string }[] = [
  { id: 'quests', label: 'Quests' },
  { id: 'hero', label: 'Hero' },
  { id: 'deeds', label: 'Deeds' },
  { id: 'titles', label: 'Titles' },
  { id: 'loot', label: 'Loot' },
]

const save = atom({ plugin: 'xp4life', key: 'save' } as const, freshSave(''))
const tab = atom({ plugin: 'xp4life', key: 'tab' } as const, 'quests')
const lootPick = atom({ plugin: 'xp4life', key: 'lootPick' } as const, 0)
const flash = atom({ plugin: 'xp4life', key: 'flash' } as const, null)

const openLog = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: 'XP4Life', focus: true, closeOnEscape: true })

/** Applies an event, saves it across sessions, and toasts what happened. */
const dispatch = async ($: EngineInterface, event: GameEvent) => {
  const now = await $.clock.now()
  const box: { out?: ReturnType<typeof apply> } = {}
  const next = await update($, save, s => {
    box.out = apply(s, event, now)
    return box.out.save
  })
  await $.store.set('save', next)
  const out = box.out
  if (out?.flash) {
    const shown = out.flash
    await update($, flash, () => shown)
    $.clock.after(90_000, () => {
      void update($, flash, f => (f?.at === shown.at ? null : f))
    })
  }
  if (out && out.notes.length > 0) $.ui.toast(out.notes.join('   ·   '))
  return out
}

// ---------------------------------------------------------------- drawing

const bar = (into: number, span: number, width: number) => {
  const filled = Math.max(0, Math.min(width, Math.round((into / Math.max(1, span)) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const progressOf = (s: Save) => {
  const level = levelOf(s.xp)
  const floor = xpForLevel(level)
  return { level, into: s.xp - floor, span: xpForLevel(level + 1) - floor }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const toBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += BASE64.charAt((n >> 18) & 63) + BASE64.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? BASE64.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? BASE64.charAt(n & 63) : '='
  }
  return out
}

const DEFAULT_COLOR = 0x01000000
/** Empty, then four golds by XP earned that day. */
const heatOf = (xp: number) =>
  xp <= 0 ? 0x2d333b : xp < 30 ? 0x5c4a12 : xp < 80 ? 0x8f6b12 : xp < 150 ? 0xc8921a : 0xffc93c

/** A GitHub-style grid of XP per day: one row per weekday, one column per week. */
const heatmapCells = (s: Save, now: number, weeks: number) => {
  const columns = weeks * 2
  const words = new Uint32Array(columns * 7 * 3)
  const weekday = (new Date(now).getDay() + 6) % 7
  const start = now - (weekday + (weeks - 1) * 7) * 86_400_000
  for (let d = 0; d < 7; d += 1) {
    for (let w = 0; w < weeks; w += 1) {
      const at = start + (w * 7 + d) * 86_400_000
      const cell = (d * columns + w * 2) * 3
      const isFuture = at > now
      words.set([isFuture ? 0x20 : 0x25a0, isFuture ? DEFAULT_COLOR : heatOf(s.dayXp[dayOf(at)] ?? 0), DEFAULT_COLOR], cell)
      words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], cell + 3)
    }
  }
  return { cells: toBase64(new Uint8Array(words.buffer)), columns }
}

type Els = ReturnType<EngineInterface['ui']['resolve']>
type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

/** Pixel art where the surface can draw it (the terminal); nothing elsewhere. */
const art = ($: EngineInterface, e: RenderEvent, key: string, cells: string, columns: number, rows: number) => {
  if (e.surface !== 'terminal') return null
  const { Raster } = $.ui.resolve(e)
  return <Raster key={key} cells={cells} columns={columns} rows={rows} />
}

const heroCard = ($: EngineInterface, e: RenderEvent, els: Els, s: Save, now: number, width: number) => {
  const { Box, Text } = els
  const { level, into, span } = progressOf(s)
  const streak = streakOf(s, now)
  const c = s.counters
  const passiveToday = s.passiveDayXp[dayOf(now)] ?? 0
  const weeks = Math.max(4, Math.min(26, Math.floor((width - 2) / 2)))
  const heat = heatmapCells(s, now, weeks)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={2}>
        {art($, e, 'emblem', EMBLEM, EMBLEM_COLUMNS, EMBLEM_ROWS)}
        <Box flexDirection="column">
          <Text bold color={GOLD}>⚔ {s.equipped}</Text>
          <Text>Level {level}</Text>
          <Text>
            <Text color={GOLD}>{bar(into, span, 20)}</Text> <Text dimColor>{into}/{span} to Lv {level + 1}</Text>
          </Text>
          <Text>
            Total {s.xp} XP{streak > 0 ? `  ·  🔥 ${streak}-day streak` : ''}
          </Text>
          <Text dimColor>
            Commits {c.commits} · Tests passed {c.testPasses} · Bugs slain {c.bugsSlain}
          </Text>
          <Text dimColor>
            Files forged {c.filesForged} · Quests {c.questsDone} · Deeds {Object.keys(s.achievements).length}/{ACHIEVEMENTS.length} · Loot {s.inventory.length}/{LOOT.length}
          </Text>
          <Text dimColor>
            Passive XP today {passiveToday}/{PASSIVE.dailyCap} · adventuring since {s.startedOn}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dimColor>Activity, last {weeks} weeks</Text>
        {art($, e, 'heat', heat.cells, heat.columns, 7)}
      </Box>
    </Box>
  )
}

const questsTab = ($: EngineInterface, els: Els, s: Save) => {
  const { Box, Text, Button } = els
  const active = s.quests.filter(q => q.status === 'active')
  const done = s.quests.filter(q => q.status === 'completed').length
  return (
    <Box flexDirection="column" gap={1}>
      {active.length === 0 && (
        <Text dimColor>No active quests. Ask Claude to propose one for something you want done.</Text>
      )}
      {active.map(q => (
        <Box key={`q-${q.id}`} flexDirection="column">
          <Text>
            <Text bold color={TIER_COLOR[q.tier]}>◆ {q.name}</Text>
            <Text dimColor>  {q.tier} · +{QUEST_XP[q.tier]} XP{q.chain ? ` · ${q.chain}` : ''}{q.source === 'claude' ? ' · from Claude' : ''}</Text>
          </Text>
          <Text dimColor italic>  {q.objective}</Text>
          {q.tasks.map((t, i) => (
            <Text key={`t-${q.id}-${i}`}>
              <Text color={t.done ? '#1eff00' : undefined}>  {t.done ? '✔' : '☐'} </Text>
              <Text dimColor={t.done}>{t.text}</Text>
              {t.need ? <Text dimColor> {Math.min(t.have ?? 0, t.need)}/{t.need}</Text> : null}
              {t.trigger && !t.done ? <Text dimColor> (auto)</Text> : null}
            </Text>
          ))}
          <Box flexDirection="row" gap={1}>
            {isQuestReady(q) && (
              <Button
                key={`claim-${q.id}`}
                label={`Claim +${QUEST_XP[q.tier]} XP`}
                variant="primary"
                onPress={() => {
                  void dispatch($, { kind: 'claim', questId: q.id, roll: Math.random(), pick: Math.random() })
                }}
              />
            )}
            {q.source === 'claude' && (
              <Button
                key={`abandon-${q.id}`}
                label="Abandon"
                onPress={() => {
                  void dispatch($, { kind: 'abandon', questId: q.id })
                }}
              />
            )}
          </Box>
        </Box>
      ))}
      <Text dimColor>Completed quests: {done}</Text>
    </Box>
  )
}

const deedsTab = (els: Els, s: Save) => {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      {ACHIEVEMENTS.map(a => {
        const on = s.achievements[a.id]
        return (
          <Text key={`a-${a.id}`}>
            <Text color={on ? '#1eff00' : undefined} dimColor={!on}>{on ? '✔' : '·'} </Text>
            <Text bold={!!on} color={on ? TIER_COLOR[a.tier] : undefined} dimColor={!on}>{a.name}</Text>
            <Text dimColor>  {a.text}  ({a.tier}; people ~{a.global.replace('~', '')}, coders ~{a.field.replace('~', '')}){a.title ? `  title: ${a.title}` : ''}{on ? `  ${on}` : ''}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

const titlesTab = ($: EngineInterface, els: Els, s: Save) => {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="column">
      {s.titles.map((title, i) => (
        <Box key={`title-${i}`} flexDirection="row" gap={1}>
          {title === s.equipped ? (
            <Text color={GOLD}>[ equipped ]</Text>
          ) : (
            <Button
              key={`equip-${i}`}
              label="Equip"
              onPress={() => {
                void dispatch($, { kind: 'equip', title })
              }}
            />
          )}
          <Text bold={title === s.equipped}>{title}</Text>
          {LEGACY_TITLES.includes(title) && <Text dimColor>legacy, from the XP4Life vault</Text>}
        </Box>
      ))}
    </Box>
  )
}

const lootTab = ($: EngineInterface, e: RenderEvent, els: Els, s: Save, pick: number) => {
  const { Box, Text, Button } = els
  const owned = s.inventory
    .map(entry => ({ entry, item: LOOT.find(i => i.id === entry.id) }))
    .filter(x => x.item !== undefined)
  if (owned.length === 0) {
    return <Text dimColor>No loot yet. Claimed quests have a chance to drop gear, keys and weapons; rarer quests drop more often.</Text>
  }
  const chosen = owned[Math.min(pick, owned.length - 1)] ?? owned[0]!
  const item = chosen.item!
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={2}>
        {art($, e, `loot-art`, item.art, ART_COLUMNS, ART_ROWS)}
        <Box flexDirection="column">
          <Text bold color={TIER_COLOR[item.tier]}>{item.name}</Text>
          <Text dimColor>{item.tier} {item.cls} · found {chosen.entry.on}</Text>
          <Text italic>{item.notes}</Text>
        </Box>
      </Box>
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {owned.map((x, i) => (
          <Button
            key={`loot-${i}`}
            label={x.item!.name}
            variant={i === pick ? 'primary' : undefined}
            onPress={() => {
              void update($, lootPick, () => i)
            }}
          />
        ))}
      </Box>
    </Box>
  )
}

const summaryText = (s: Save, now: number) => {
  const { level, into, span } = progressOf(s)
  const active = s.quests.filter(q => q.status === 'active')
  return [
    `${s.equipped}, level ${level} (${into}/${span} XP to next), ${s.xp} XP total, ${streakOf(s, now)}-day streak.`,
    `Deeds ${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length}, loot ${s.inventory.length}, quests claimed ${s.counters.questsDone}.`,
    active.length ? `Active quests: ${active.map(q => q.name).join(', ')}.` : 'No active quests.',
  ].join('\n')
}

const questBrief = (s: Save) => {
  const active = s.quests.filter(q => q.status === 'active')
  const lines = active.map(q => {
    const tasks = q.tasks
      .map((t, i) => `${i + 1}. [${t.done ? 'x' : ' '}] ${t.text}${t.trigger ? ' (auto)' : ''}`)
      .join('; ')
    return `- ${q.id} "${q.name}" (${q.tier}${q.source === 'claude' ? ', proposed by you' : ''}): ${q.objective} Tasks: ${tasks}`
  })
  return [
    'XP4Life: the user runs a light RPG layer (XP, quests, titles, loot) over their real work in Claude Code. Do not bring it up unless it is relevant or they ask.',
    lines.length ? `Their active quests:\n${lines.join('\n')}` : 'They have no active quests.',
    'When you have actually finished a task marked [ ] (not "(auto)") in one of these quests during this conversation, call mcp__xp4life__complete_quest_task with concrete evidence. Tasks marked (auto) tick themselves when the work happens.',
    'Call mcp__xp4life__propose_quest only when the user asks for a quest or agrees to one. You choose a tier, never an XP amount, and the user claims rewards themselves in /quest.',
  ].join('\n')
}

// ---------------------------------------------------------------- hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    const stored = (await $.store.get('save')) as Save | undefined
    const loaded = stored?.version === 1 ? stored : freshSave(dayOf(now))
    if (!stored) await $.store.set('save', loaded)
    await update($, save, () => loaded)

    await $.command.register({ name: 'quest', description: 'Open the XP4Life quest log (quests, hero, deeds, titles, loot)' })
    await $.command.register({ name: 'xp', description: 'Show your XP4Life hero card' })
    await $.tool.register({
      name: 'propose_quest',
      description:
        "Adds a quest to the user's XP4Life quest log. Only call this when the user asks for a quest or agrees to one. Pick the tier by real effort: common = under an hour, uncommon = a solid session, rare = meaningful multi-session progress, epic = a major outcome. Tasks should be concrete and checkable.",
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short, game-flavored but clear quest name' },
          objective: { type: 'string', description: 'One sentence: what done looks like' },
          category: { type: 'string', description: 'build, system, creative, money, personal, or similar' },
          tier: { type: 'string', enum: PROPOSABLE },
          tasks: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
        },
        required: ['name', 'objective', 'tier', 'tasks'],
      },
    })
    await $.tool.register({
      name: 'complete_quest_task',
      description:
        'Marks one task of an active XP4Life quest done, after you have actually finished it in this conversation. Give concrete evidence (the commit, the file, the result). Tasks marked (auto) cannot be marked this way.',
      inputSchema: {
        type: 'object',
        properties: {
          quest_id: { type: 'string' },
          task_number: { type: 'integer', minimum: 1, description: '1-based, as listed' },
          evidence: { type: 'string' },
        },
        required: ['quest_id', 'task_number', 'evidence'],
      },
    })
    if (!stored) $.ui.toast('⚔ XP4Life: a new world begins. Type /quest to see your first quest.')
    return next(e)
  })

  // Proof of work: commits and test runs from either shell, and files that did not exist before.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as { command?: unknown; file_path?: unknown; run_in_background?: unknown }

    if (tool === 'Write' && typeof input.file_path === 'string') {
      const isNew = await $.fs.stat(input.file_path).then(
        () => false,
        () => true,
      )
      const ran = await next(e)
      if (isNew && ran.deny === undefined && ran.isError !== true) await dispatch($, { kind: 'new-file' })
      return ran
    }

    if ((tool !== 'Bash' && tool !== 'PowerShell') || typeof input.command !== 'string' || input.run_in_background === true) {
      return next(e)
    }
    const isCommit = COMMIT.test(input.command)
    const isTest = TESTS.test(input.command)
    if (!isCommit && !isTest) return next(e)

    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const failed = ran.isError === true
    if (isCommit && !failed && !/nothing to commit|no changes added/i.test(ran.text ?? '')) {
      await dispatch($, { kind: 'commit' })
    }
    if (isTest) await dispatch($, { kind: 'tests', passed: !failed })
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__xp4life__propose_quest' }, async ($, e) => {
    const input = e as unknown as { name?: string; objective?: string; category?: string; tier?: string; tasks?: unknown }
    const tasks = Array.isArray(input.tasks) ? input.tasks.map(String) : []
    const out = await dispatch($, {
      kind: 'propose',
      quest: {
        name: String(input.name ?? ''),
        objective: String(input.objective ?? ''),
        category: String(input.category ?? 'general'),
        tier: String(input.tier ?? 'common') as Tier,
        tasks,
      },
    })
    if (!out || out.error) return { result: `Not added: ${out?.error ?? 'unknown error'}` }
    return {
      result: `Added quest ${out.questId}. The user sees it in /quest and claims it when every task is done. At most ${MAX_CLAUDE_QUESTS} of your quests can be open at once.`,
    }
  })

  on('tool.call', { tool: 'mcp__xp4life__complete_quest_task' }, async ($, e) => {
    const input = e as unknown as { quest_id?: string; task_number?: number; evidence?: string }
    const out = await dispatch($, {
      kind: 'task-done',
      questId: String(input.quest_id ?? ''),
      task: Number(input.task_number ?? 0),
      evidence: String(input.evidence ?? ''),
    })
    if (!out || out.error) return { result: `Not marked: ${out?.error ?? 'unknown error'}` }
    return { result: 'Task marked done. Rewards are claimed by the user in /quest.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const s = await read($, save)
    return {
      sections: [...composed.sections, { id: 'xp4life:quests', text: questBrief(s), scope: 'session' as const }],
    }
  })

  on('command.run', { command: 'quest' }, async ($, e) => {
    const wanted = TABS.find(t => t.id === e.args.trim().toLowerCase())
    if (wanted) await update($, tab, () => wanted.id)
    await openLog($)
    return { text: 'Opened the XP4Life quest log.' }
  })

  on('command.run', { command: 'xp' }, async $ => {
    const s = await read($, save)
    return { text: summaryText(s, await $.clock.now()) }
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'xp' } }, async ($, e) => {
    const els = $.ui.resolve(e)
    const s = await read($, save)
    return heroCard($, e, els, s, await $.clock.now(), e.viewport?.columns ?? 80)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, save)
    const f = await read($, flash)
    const now = await $.clock.now()
    const { level, into, span } = progressOf(s)
    const streak = streakOf(s, now)
    const quest = s.quests.find(isQuestReady) ?? s.quests.find(q => q.status === 'active')
    const done = quest ? quest.tasks.filter(t => t.done).length : 0
    return (
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        <Text bold color={GOLD}>⚔ {s.equipped}</Text>
        <Text>Lv {level}</Text>
        <Text color={GOLD}>{bar(into, span, 10)}</Text>
        <Text dimColor>{into}/{span}</Text>
        {streak > 0 && <Text color="#ff8000">🔥{streak}</Text>}
        {quest && (
          <Text color={TIER_COLOR[quest.tier]}>
            ◆ {quest.name} {done}/{quest.tasks.length}
          </Text>
        )}
        {quest && isQuestReady(quest) && <Text bold color="#1eff00">ready to claim!</Text>}
        {f && <Text color="#1eff00">+{f.xp} {f.reason}</Text>}
        <Button key="open-log" label="Quest log" onPress={() => void openLog($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button } = els
    const s = await read($, save)
    const current = await read($, tab)
    const now = await $.clock.now()
    const width = e.props.bodyColumns
    let body
    if (current === 'hero') body = heroCard($, e, els, s, now, width)
    else if (current === 'deeds') body = deedsTab(els, s)
    else if (current === 'titles') body = titlesTab($, els, s)
    else if (current === 'loot') body = lootTab($, e, els, s, await read($, lootPick))
    else body = questsTab($, els, s)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" columnGap={1}>
          {TABS.map((t, i) => (
            <Button
              key={`tab-${t.id}`}
              label={t.label}
              hotkey={String(i + 1)}
              variant={t.id === current ? 'primary' : undefined}
              onPress={() => {
                void update($, tab, () => t.id)
              }}
            />
          ))}
        </Box>
        {body}
      </Box>
    )
  })
}