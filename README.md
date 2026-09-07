# Casino Bot

A Discord economy bot: cash, bank, and total balance, fully isolated per server.

## How the money system works

- **Cash** — money "on hand." Bets and store purchases always come out of cash.
  Cash **can go negative** (e.g. debt from a lost bet).
- **Bank** — safe money. Never touched by bets or purchases, only by
  `/deposit` and `/withdraw`. The bank can't go negative — you can only
  withdraw what's actually in it.
- **Total** — `cash + bank`, computed on the fly. If you have -1240 cash and
  5000 bank, your total shows 3760.
- **Per-server** — every setting and every balance is stored per-guild. The
  same person has a completely separate balance (and your server has
  completely separate settings) on every server the bot is in.
- **Concurrency-safe** — all balance changes are single atomic SQL
  statements (or wrapped in a `better-sqlite3` transaction when a check is
  needed, like "do they have enough cash to deposit?"). Two commands firing
  at the same instant can't corrupt a balance or double-spend.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/balance [user]` | everyone | Shows cash, bank, total |
| `/deposit <amount\|all>` | everyone | Cash → bank |
| `/withdraw <amount\|all>` | everyone | Bank → cash |
| `/economy-setup view` | Manage Server | Shows this server's currency name/symbol/starting balances |
| `/economy-setup edit ...` | Manage Server | Changes those settings |
| `/economy-setup reset` | Manage Server | **Wipes every member's balance on this server** (asks for confirmation first) |
| `/admin-money add/remove` | Manage Server | Manually adjusts a user's cash or bank |
| `/system shutdown` | Bot owner (`OWNER_IDS`) | Shuts the bot down completely, on every server |
| `/system restart` | Bot owner (`OWNER_IDS`) | Restarts the bot process, on every server |
| `/system refresh-commands` | Bot owner (`OWNER_IDS`) | Re-registers slash commands live — no `npm run deploy` needed |

`/system` is intentionally locked to specific user IDs rather than "Manage Server", since a shutdown or restart affects every server the bot is in, not just the one it was run from — a server admin shouldn't be able to take the bot offline everywhere. Set `OWNER_IDS` in `.env` to your own Discord user ID (comma-separate for more than one person).

**A note on `/system restart`:** it works by spawning a fresh copy of the same process and exiting the old one — this works whether you're running the bot directly with `node` or through a process manager like pm2/systemd/Docker (which will also restart it on exit regardless). It won't work if you're on a host with an ephemeral/read-only filesystem where re-spawning `node` isn't possible — on those hosts, use the platform's own restart mechanism instead.

## Setup

1. **Create the Discord application**
   - Go to https://discord.com/developers/applications → New Application.
   - Bot tab → Reset Token → copy it (this is `DISCORD_TOKEN`).
   - General Information tab → copy the Application ID (this is `CLIENT_ID`).
   - Bot tab → make sure "Public Bot" is set how you want it.
   - OAuth2 → URL Generator → check `bot` and `applications.commands` scopes,
     then under Bot Permissions pick at least "Send Messages" and
     "Use Slash Commands". Open the generated URL to invite the bot to your
     server.

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN` and `CLIENT_ID`. While developing, also set
   `DEV_GUILD_ID` to your test server's ID (enable Developer Mode in Discord,
   right-click your server icon → Copy Server ID) — this makes slash commands
   register instantly instead of waiting up to an hour for a global deploy.

4. **Register the slash commands**
   ```bash
   npm run deploy
   ```
   Re-run this any time you add/change a command's options.

5. **Start the bot**
   ```bash
   npm start
   ```

Data is stored in `data/economy.sqlite` (created automatically). Back that
file up if you care about not losing balances.

There's also a standalone `clear-commands.js` script (`node clear-commands.js`)
that wipes all *globally* registered commands — handy if you ever end up with
duplicate/stale commands and want a clean slate before running `npm run deploy`
again. `/system refresh-commands` is what you'll use day-to-day instead.

## Adding new commands later

Drop a new file into `src/commands/economy/` or `src/commands/admin/` (or a
new category folder) following the same `{ data, execute }` shape as the
existing ones, then run `npm run deploy` again. `src/utils/economy.js` is
the one place all balance math lives — future games (blackjack, slots,
etc.) should use `placeBet()` for taking a bet and `addCash()` for paying
out, rather than writing new SQL.

## Changelog: session locks, equip fixes, and collectibles

- **Duel challenges now lock out every other command.** While a `/duel
  challenge` is pending (waiting on Accept/Decline), neither the challenger
  nor the opponent can run any other slash command, including `/equip` —
  enforced globally in `src/index.js` via the existing session-lock system
  (`src/utils/activeSession.js`), not just inside `/duel` itself.
- **Fixed the equip dupe bug.** Equipping an item now removes it from
  inventory, and unequipping returns it — so a single copy of an item (e.g.
  1x Rusty Sword) can no longer be equipped into both hands at once for a
  double stat stack. Two-handed weapons still only ever consume/return one
  copy, since they're one physical item spanning both hand slots. See
  `equipItem` in `src/utils/inventory.js`.
- **`/loadout load`** now re-applies presets through the same equip logic
  above, so it respects the new inventory accounting.
- **`/equip unequip_all:true`** takes everything off in one command instead
  of clearing each slot individually.
- **Consumables (previously "step 6") were replaced with collectibles.**
  Collectibles have a passive `/claim` reward (gambling currency, arena
  coins, or both) instead of being one-time-use items:
  - Every player gets 3 starter collectibles for free, automatically, the
    first time they're seen (see `src/utils/collectibles.js`).
  - More are purchasable at different prices via the new `/store` command.
  - A couple are extremely rare bonus drops from a `/champion` win.
  - `/claim` claims from everything that's off cooldown at once and shows
    a countdown for anything still cooling down.
  - **Every claim-reward collectible is capped at 1 per player** — no
    stacking multiple copies of the same one for a bigger payout. This is
    enforced centrally in `addItemToInventory`, so it applies no matter
    how the copy would be obtained (store, admin grant, or Champion drop).
  - **The cooldown between claims is ONE universal setting**, not
    configured per item — every collectible on a server shares the same
    cooldown. Admins adjust it with `/arena-setup edit-claim` (default: 3
    hours).

## Changelog: arena stats, durability & repair, ranks/titles, exchange admin controls

- **Arena stats.** `/duel` and `/champion` now write to the same
  `game_stats` table `/blackjack` already used (`utils/economy.js`'s
  `recordGameResult`) — deliberately **not** `/slave`. `/stats` shows
  win/loss for these with no currency line (arena stats track record only
  — the wager/payout from any given fight is already shown in that
  command's own result embed, and duels span two different currencies
  depending on what was wagered, so one "net" number would be misleading
  anyway).
- **Ranks & titles**, computed live from arena stats — no new schema, no
  "current rank" to keep in sync:
  - A prestige **rank** from combined duel + Champion wins (Recruit →
    Fighter → Veteran → Gladiator → Champion → Legend — thresholds and
    names are in `utils/ranks.js`, easy to retune).
  - A separate, just-for-laughs **loser title** track from combined
    losses (Practice Dummy at 25, up to "Arena's Favorite Donor" at 200) —
    a player can hold a high rank AND a loser title at the same time.
  - Both show in `/stats`.
- **Durability & repair.** Every equipment item has a durability pool
  sized by rarity (`MAX_DURABILITY_BY_RARITY` in `data/items.js`). Only
  **Champion fights** cause wear (every fight, win or lose) — duels are a
  flat 50/50 with no gear involved, so they never touch it. A piece at 0
  durability stays equipped but contributes **none** of its effects
  (`getEquipmentEffectTotals`) until repaired via the new `/repair`
  command (`status` / `item` / `all`), which spends cash scaled by rarity
  and how much durability is missing. `/gear` now shows each piece's
  durability too. Durability is tracked per (guild, user, item_id) — the
  same "shared bucket per item type" simplification the rest of the
  inventory model already makes (see `database.js`'s `item_durability`
  table comment for what that means if you own 2+ copies of one item).
- **`/exchange` is now admin-configurable** via
  `/arena-setup edit-exchange`: a cooldown between exchanges (off by
  default — existing servers see no behavior change until an admin opts
  in) and the daily arena-coin cap (previously a hardcoded constant,
  default unchanged at 30).

## Status monitor

`status-monitor.js` (project root) is a separate process — run it with
`node status-monitor.js`, independent from the bot itself. The bot writes a
heartbeat to `data/bot-heartbeat.json` every 30s (and on shutdown via
SIGINT/SIGTERM); the monitor watches that file and posts/edits a status
embed in a channel via a Discord webhook (`STATUS_WEBHOOK_URL` in `.env`).
See `.env.example` for the rest of its settings.

## Changelog: Gladiator entity, XP/levels, bitfield tiers, and the /stats split

This is the foundation for the bigger Arena overhaul — the Gladiator is now
a real, named entity everything else (leveling, gear gating, Adventures,
flavor text) will hang off of. **`/adventure` itself is NOT built yet** —
this round is the entity + progression plumbing it'll run on.

- **New `/gladiator` command** (`profile` / `name`). One Gladiator per
  (guild, user) — see the `gladiators` table in `database.js`. Renaming is
  free and unlimited (`utils/gladiator.js`'s `setGladiatorName`). Names are
  validated (2-32 chars, letters/numbers/spaces/`'`/`-`/`.` only) so they
  can't break embeds or ping people once they start appearing in flavor
  text across duels/Champion/Adventures later.
- **Gladiator XP & levels**, classic escalating curve (`utils/xp.js`) —
  cheap early levels, brutal late ones, capped at level 99. Level is always
  *derived* from stored XP, never stored itself, so it can't drift out of
  sync. The curve's shape is set; how much XP Adventures/Champion fights
  actually award (i.e. how fast leveling really feels) is still an open
  balance pass once those exist.
- **The `adventure_started_at`/`adventure_ends_at` fields and state
  helpers exist already** (`isGladiatorAdventuring`, `startGladiatorAdventure`,
  `endGladiatorAdventure`) so `/champion` can be gated on them once
  `/adventure` is built — **`/duel` and `/blackjack` are explicitly meant
  to stay usable while a Gladiator is away**, only `/champion` locks.
- **Bitfield tiers.** `/bitfield` now supports `TIER_1`-`TIER_10` on top of
  `ADMIN` (`utils/permissions.js`) — donor/supporter perk tiers, granted by
  hand for now. Only `TIER_1` (+5 min) and `TIER_2` (+10 min) have a defined
  perk so far (extra `/adventure` trip time, once that command exists) —
  the rest are just grantable flags waiting on a perk. Multiple tiers
  don't stack; the highest one with a defined bonus wins.
- **`/stats` → `/pnl_data`, gambling-only.** Shows blackjack win/loss/net
  only now. The arena win/loss record and rank/loser-title block that used
  to live in `/stats` moved to `/gladiator profile` instead — **this is a
  judgment call**, not an explicit instruction; Rank/Achievements/Titles is
  its own separate "Player Progression" system on the roadmap and might
  end up wanting its own command once that's built out. Easy to relocate
  later if a dedicated `/rank` command makes more sense once
  achievements/badges exist.
- **`/loadout`** cap raised from 3 saved presets to 6 (`MAX_LOADOUTS` in
  `utils/inventory.js`).
- **`/trade` accept timeout** shortened from 60s to 30s.
- **`/champion` now awards Gladiator XP**, win or lose
  (`awardChampionFightXp` in `utils/gladiator.js`). The amount is a
  percentage of the XP gap between the Gladiator's current level and the
  next one — 8% on a win, 2% on a loss — so the raw XP number climbs
  naturally as the Gladiator levels (since that gap grows on the escalating
  curve), while the number of wins needed to clear any given level stays
  roughly constant (~12-13) no matter how high the level is. No runaway
  acceleration, no massive jumps.
