# XP4Life for Claude Code

```
       █████████████
     ██▀▀▀▀▀▀▀▀▀▀▀▀▀██
 ████▀               ▀████
██ ▄▄▄    ▄▄▄ ▄▄▄▄▄▄▄▄   ██
██  ▀██ ▄███▀ ███▀▀▀▀██▄ ██
██   ▀████▀   ███    ███ ██
██   ▄████▄   █████████▀ ██
██ ▄███▀ ███▄ ███        ██
██ ▀▀▀    ▀▀▀ ▀▀▀        ██
██    ▄█████  ███        ██
██  ▄██▀  ██  ███        ██
██  █████████ ███       ▄██
▀█▄       ██  ████████ ▄██▀
 ▀██▄▄               ▄██▀
   ▀▀███▄▄       ▄▄███▀
       ▀▀███▄▄▄███▀▀
           ▀▀█▀▀
```

A light RPG layer over real work in Claude Code. Earn XP from proof of work, run
quest chains, unlock achievements and titles, and collect loot, all drawn in the
terminal (and the desktop app).

It grew out of the XP4Life Obsidian vault. This is a fresh world built for an AI
coding agent: the progression ideas that worked, without the event bloat.

## Install

```
/plugin install xp4life --marketplace toakezg/xp4life-claude
```

Answer `y` to add the marketplace, then pick a scope. To run it from a local
copy while developing:

```
claude --plugin-dir path/to/xp4life-claude
```

## Play

| | |
| --- | --- |
| The band above the prompt | Title, level, XP bar, streak, current quest, last gain |
| `/quest` | The quest log: Quests, Hero, Deeds, Titles, Loot (keys 1 to 5) |
| `/quest hero` | Open straight to a tab |
| `/xp` | Your hero card in the transcript |
| "propose a quest for ..." | Claude adds a quest to your log |

## How XP works

XP is earned from proof, not activity:

| Proof | XP |
| --- | ---: |
| A commit lands (`git commit` succeeds) | 20 |
| A test run passes (pays again after 10 minutes) | 10 |
| A bug is slain: a failing test run, then a passing one | 25 |
| A new file is created | 3 |

That passive XP is capped at **150 a day**. The real rewards are quests and
deeds, which are uncapped:

| Tier | Quest | Deed | Loot chance |
| --- | ---: | ---: | ---: |
| Common | 50 | 25 | 15% |
| Uncommon | 120 | 75 | 30% |
| Rare | 300 | 200 | 55% |
| Epic | 700 | 500 | 90% |
| Legendary | 1500 | 1000 | 100% |

Levels need 100, 300, 600, 1000, ... XP in total (`50 * (L - 1) * L`).

**Claude as quest giver.** Claude can propose quests (common to epic) and mark
its own tasks done with evidence. It picks a tier, never an XP amount, and only
you claim rewards. Tasks marked *(auto)* tick themselves when the work happens.

## Your progress

Everyone starts a fresh world at level 1. Your save is yours alone: it lives in
the plugin's store under your Claude Code config
(`~/.claude/plugins/store/`), never in this repository, so it carries across
sessions and projects and nobody else's progress ships with the plugin.

Updating the plugin replaces its code, not your save. A save from an older
version is read as it is and gains any new fields with their defaults; the
plugin never resets a save it can read. To start over, delete the `xp4life`
file in that folder.

## Status

An early, playable prototype. Expect the numbers and content to change.

## Develop

```
claude plugin validate .
claude plugin test .
```

`hooks/engine.ts` is the game: a pure function from save and event to the next
save, so it is tested without the UI. `hooks/rules.ts` holds the numbers,
achievements and the starter questline; `hooks/register.tsx` the hooks and UI.

The art is baked into `hooks/loot.ts` by `tools/gen_loot.py` (needs Pillow):

```
python tools/gen_loot.py <XP4Life Assets dir> assets/emblem-terminal.png hooks/loot.ts
```

## License

MIT, see [LICENSE](LICENSE).
