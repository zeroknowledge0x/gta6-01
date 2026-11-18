# Mirador Bay — Sunset Heist

An original open-world crime game for make.fun bounty gta6-01. No Rockstar Games
content, characters, cities, vehicles, music or story appear here: Mirador Bay,
Kai Reyes, Marisol Vega and the Harbour Boss are inventions of this entry.

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeroknowledge0x/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/zeroknowledge0x/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

## The city and the story

Mirador Bay is a sun-soaked coastal grid of eight-by-eight blocks: downtown
towers with lit windows, palm-lined parks, shop signs, a harbour full of crates
and a long pier reaching into blue water. Traffic flows in both directions on
the avenues, pedestrians wander the pavements and the police respond when you
cross the line.

You play **Kai Reyes**, a getaway driver who has come home after years away.
**Marisol "Mars" Vega**, a fixer who runs a garage on the east side, offers five
jobs: a walk across Plaza Street, a stolen red Veltro, a crate lifted from the
docks, a timed three-drop run across town, and a final vault heist that ends
with the whole city in pursuit and a boat waiting at the pier. Money, health,
armour, weapons, wanted stars and job progress all persist in a local save.

## Run it

```
node serve.ts
```

then open http://localhost:8080. You can also open `game/index.html` directly
in a desktop browser. The game is offline: no network request is made at
runtime, and every asset is either a file under `game/` or drawn in code.

## Controls

- WASD — walk / run / drive; SHIFT to sprint
- SPACE — jump on foot, handbrake in a car
- E — enter or leave the nearest vehicle
- Mouse — look; left click or F — fire; 1-5 — select weapon; R — reload
- ESC — pause menu (resume, restart job, toggle sound)
- Press ENTER on the title screen to start; jobs advance with ENTER

Sound — engines, gunfire, sirens, footsteps and a small music loop — is
synthesised at runtime with Web Audio; there are no audio files.

## Build

```
export PATH=/opt/data/node22/bin:$PATH
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

Every source file under `game/src/` has one job: `config.js` (tuning table),
`random.js` (seeded numbers), `city.js` (layout and collision), `entities.js`
(cars and people), `police.js` (wanted level), `combat.js` (bullets and damage),
`missions.js` (story), `audio.js` (synthesis), `world.js` (simulation step),
`render.js` (three.js scene), `hud.js` (overlay), `shots.js` (deterministic
poses) and `main.js` (input and frame loop).
