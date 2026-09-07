# Commands

Generated directly from the current command code (each `/help`, `/config`, etc. below
is pulled from the actual `SlashCommandBuilder` definitions), so this should never go
stale-and-unnoticed the way a hand-maintained list does — if a command's description
changes in code, this file just needs a re-generate, not a rewrite.

## Getting Started

- `/starter` — claim your Tiro's Panoply starter kit (armor, weapons, and collectibles), once per player
- `/help` — button-driven guide: Arena & Gladiator / Blackjack / Roulette / Dice / Slots, tap a category to view

## Your Gladiator

- `/gladiator profile` — view your Gladiator's profile (level, XP, arena record)
- `/gladiator name name:<new name>` — rename your Gladiator (free, unlimited, unless an admin has locked it)
- `/adventure start [location]` — send your Gladiator out on an Adventure (location requires TIER_3 perk)
- `/adventure cancel` / `/trip` — cancel your current Adventure early (steep penalty vs. letting it finish)

## Champion & Duels

- `/champion fight bracket:<bracket> wager:<amount>` — wager arena coins against the Champion in a chosen Bracket. Harder Brackets = worse odds, bigger payout multiplier; completing a full arena set unlocks the next one.
- `/champion odds` — preview your odds and payout for every Bracket you've unlocked
- `/duel challenge opponent:<player> wager:<amount> [currency]` — challenge another player, flat 50/50, no gear involved (wager in arena coins or gambling currency)

## Equipment

- `/gear` — view your currently equipped Arena gear and its bonuses
- `/equip <slot>:<item> ... [unequip_all] [bis]` — equip/unequip gear; set multiple slots at once; type an item's name or pick from the menu; `bis:true` auto-equips your best owned gear in every slot
- `/inventory type:<equipment|collectable>` — view your owned Arena items
- `/loadout save name:<preset>` / `load name:<preset>` / `list` / `delete name:<preset>` — save and swap between full gear presets
- `/repair item:<item>` / `/repair all` — repair worn-down equipment (only Champion fights cause wear, duels never do)

## Currency

- `/balance [user]` — check cash, bank, and total balance (yours or someone else's)
- `/deposit amount:<amount>` / `/withdraw amount:<amount>` — move money between cash and bank (bank is safe from `/rob`)
- `/exchange` — convert between gambling currency and arena coins (one-way is much better than the reverse, on purpose)
- `/pay user:<player> amount:<amount>` — send another player money directly
- `/trade user:<player> [send] [receive] [price] [currency]` — offer a structured trade (gear, collectables, coins, and/or arena coins)
- `/rob user:<player>` — attempt to rob another player's cash on hand
- `/slave` — work the arena grounds for cash and a chance at arena coins (cooldown set by server admins)
- `/store view` / `/store buy item:<item> [quantity]` — buy passive-income collectibles with cash
- `/arena-shop buy item:<item> [quantity]` — buy Arena Store gear with arena coins
- `/claim` — claim passive rewards from every collectible you own that's off cooldown

## Casino Games

- `/blackjack bet:<amount> [side_bet]` — play a hand against the dealer; Hit/Stand/Double/Split, optional Perfect Pairs side bet
- `/roulette bet:<amount> type:<pick> [number]` — bet on the wheel; type your pick (`red`, `black`, `dozen1`, a number, etc.) or use the menu; joins the shared round for that channel
- `/dice bet:<amount>` — roll 3 dice (Roman Tali); pair / straight / triple / the legendary Venus Throw (6-6-6)
- `/slots bet:<amount>` — spin the slots; middle row is the one that counts
- `/gamble_stats` — see how much you're up or down, per gambling game

## Info

- `/leaderboard type:<board>` — top-10 server leaderboard (richest, most wins per game, XP, and more)

## Admin

- `/admin user:<player>` — player administration panel
- `/config` — button-driven server configuration panel (Economy / Casino / Arena, drill into each)
- `/status` — bot uptime and connection status

## Mod

Opens a button panel (same style as `/admin`/`/owner`). Requires the MOD
bitfield flag — admins have access automatically.

- `/mod` → **Name Lock** — pick a player to lock/unlock their Gladiator name
- `/mod` → **Name Filter** — add/remove/view words blocked from Gladiator names on this server

## Bot Owner

- `/system` — bot process controls
- `/bitfield grant|revoke user:<player> flag:<flag>` — manage bot-wide permission flags
- `/blacklist add|remove|list` — bot-wide user ban, every server
- `/hades` — spawn The Unseen King's Dominion (owner-exclusive prestige set)
