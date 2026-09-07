# Changelog

Not previously kept up to date — this entry covers everything since the last time
testers would have seen an update, reconstructed from the actual code changes rather
than written from memory, so treat older individual dates as approximate/grouped
rather than exact.

### Can't change equipment or repair mid-Champion-fight either
Same idea as the Adventure lock above, extended to cover the (much shorter)
window a Champion fight is actually resolving in — checks
`getActiveLabel(...) === 'a Champion fight'` (the exact label
`commands/economy/champion.js`'s own session lock already uses) and replies
"**<name>** is mid-Champion-fight and can't change their equipment right now."
Verified `endSession` fires on every exit path (win, loss, and both error
branches) before relying on it here, so this can't accidentally soft-lock
someone out of `/equip`/`/repair` if a fight ever errors out.

### Can't change equipment or repair while on an Adventure
`/equip` (any of `items:`/`item:`/`preset:`/`bis:`/`unequip_all:` — just viewing
with no flags is still fine) and `/repair item`/`/repair all` (`/repair status`
is still fine) now check `isGladiatorAdventuring` first and reply with
"**<name>** is out on an adventure and can't change their equipment." instead
of going through — same check `/champion` already used to block fighting
while away.

### 3 independent gear sets — Arena / Adventure / Misc
The single global equipped loadout is gone — every player now has 3 fully
independent gear sets, and the same physical item can only be equipped in ONE
of them at a time (own 2 swords → 1 in each set; own 1 → move it and it
auto-unequips from wherever it was).

**Which set's effects apply where:**
- Armor is context-locked: arena-shop armor only helps Champion fights, and
  only counts from the Arena set (falling back to Misc if Arena has none);
  adventure-earned armor only helps Adventures, same rule with the Adventure
  set. Starter and Hades armor pieces are the exception — they carry both
  contexts' effects on the same piece and aren't locked to one home set at
  all: they fill in for whichever context is otherwise completely empty
  (home set AND Misc both empty), no matter which of the 3 sets they're
  actually sitting in.
- Weapons never had a context to begin with (not one weapon in the game
  carries an Adventure-specific effect) — so a weapon's Wager Boost and
  Gladiator XP Bonus count toward both Champion and Adventures unconditionally,
  regardless of which of the 3 sets it's sitting in. If different weapons are
  equipped across multiple sets at once, only the single HIGHEST value per
  effect counts — never summed, same anti-double-dip logic already used for a
  matched two-handed weapon.
- Durability wear targets whichever specific item actually supplied the
  effect for that activity, not "everything currently equipped" — a weapon
  parked in Misc that won the Champion wager-boost comparison wears down from
  that fight even though it's not sitting in the Arena set.

**`/equip` is fully redesigned** (`set:` mandatory flag, plus one of `items:`
free-typed comma list, `item:` menu picker, `preset:`, `bis:`, or
`unequip_all:`) — no more one flag per slot. Confirmation shows that one set's
image, not a text wall, unless `text_format:true`.

**`/gear`** with no flags now shows a single image with all 3 sets side by
side (icons only, no names/stats); `/gear view:<set>` is the old single-set
view with full stat totals, unchanged otherwise.

**`/loadout`** lost its `load` subcommand (now `/equip preset:<name> set:<target>`);
`save` gained a mandatory `set:` to pick which set gets snapshotted.

### Duel "comeback" flavor (5%, purely cosmetic)
Duels still resolve as a flat 50/50 flip, no change to who wins or the payout —
but there's now a 5% chance (`DUEL_COMEBACK_FAKEOUT_CHANCE` in `duel.js`) the
narrative tells the story as if the loser had the winner on the ropes right up
until the finish beat, instead of the usual one-sided telling. Turn beat flashes
the same yellow used for a real Champion comeback; finish beat reveals it was
the winner all along. New line pools: `DUEL_TURN_FAKEOUT_LINES` /
`DUEL_FINISH_LINES_COMEBACK` in `combatNarrative.js`.

### Champion fight comebacks (5%)
A Champion fight that rolls as a loss now has a flat 5% chance
(`CHAMPION_COMEBACK_CHANCE` in `utils/arena.js`) to flip into a real win instead —
full payout, XP, and collectible-drop odds, exactly like any other win. The
narrative still shows the losing "yellow" turn beat first (same drama as any
other loss) and only reveals the reversal on the finish beat, with its own
dedicated flavor-text pool (`FINISH_COMEBACK_LINES`) distinct from a normal
underdog win. Result embed title changes to "🔥 Comeback Victory" so it reads
differently from a clean win.

### Categorized text audit logs (`admin.log` / `owner.log` / `mod.log` / `system.log`)
Every admin, owner, mod, and system action now writes a plain-text line to
`logs/<module>.log` (configurable via `LOG_DIR`, same convention as `BACKUP_DIR`),
in addition to the existing sqlite `admin_audit_log` table. Previously only
`/admin` and `/config` logged anything at all, and nothing anywhere displayed or
exported it — `/owner` and `/system` now log too (bitfield grants/revokes,
blacklist add/remove, Hades grants, full economy resets, shutdown/restart/deploy),
and `/mod` logs its name-lock and name-filter actions. Each line: timestamp, guild,
actor, action, target (if any), and a short details string.

### `/mod` rebuilt as a button panel
`/mod` is now a single button-driven panel (same scaffold as `/admin`/`/owner`/
`/config`/`/system`), not a set of raw slash subcommands — fixes it not
matching the rest of the admin-tooling UX.

### New `/mod` module + MOD bitfield flag
- New `MOD` bitfield flag (`/owner` → Bitfield). Admins (and the owner) pass every
  `/mod` check automatically — no separate flag needed on top of ADMIN.
- `/mod` → Name Lock — lock/unlock a Gladiator's name via a user picker. Same
  underlying lock as the toggle inside `/admin`'s Gladiator panel, just reachable
  without the rest of that panel's admin-only surface.
- `/namefilter` is gone — folded into `/mod` → Name Filter (same add/remove/list
  behavior via buttons + a word-entry popup, no longer admin-only, and finally
  living inside a command module instead of standing alone).

### Gamble-game losers leaderboards
`/leaderboard` now has four new entries — Most Blackjack/Roulette/Slots/Dice Losses —
mirroring the existing wins boards for each game. No new data tracking needed, this
just surfaces the losses column `/gamble_stats` already reads from.

### `/help` is now a menu, not a wall of text
Same button-driven panel style as `/config` — pick a category (Arena & Gladiator /
Blackjack / Roulette / Dice / Slots) and it drills in, with a Back button to return.
Still only visible to you (ephemeral), like before.

### Champion Bracket system (replaces the old flat Champion fight)
- Arena gear's old "Payout Bonus" stat is gone. Gear now gives **Fail Reduction** and
  contributes to **Gladiator XP Bonus**; payout is no longer something gear tweaks
  directly.
- `/champion fight` now asks you to pick a **Bracket** before wagering. Six Brackets
  exist — harder Brackets have worse odds but a bigger payout multiplier if you win.
  Completing and equipping a full arena set unlocks the next Bracket up; partial or
  mixed sets don't count.
- `/champion odds` shows your odds and payout across every Bracket you've unlocked,
  not just one flat number.
- Payout multipliers are now calculated from your win chance and the configured
  target RTP, not from a gear stat — so the payout you see is tied to how hard the
  fight actually is, not to a separate item bonus.

### Champion payout rebalance (superseded by the Bracket system above, listed for
history) — the previous formula let a full top-tier gear set alone reach a large
positive expected return per fight; that's what the Bracket rework above ultimately
replaced.

### Blackjack
- **Splitting is real now.** Previously only Hit/Stand/Double existed despite splitting
  being planned from the start. Same-rank pairs can now split into two hands, each
  played and paid out independently. Standard rules apply: one split only (no
  re-splitting), split Aces get exactly one card each with no further hitting, and a
  21 made after a split doesn't get the natural-blackjack 6:5 bonus.
- Fixed a bug where `bet:all` combined with a Perfect Pairs `side_bet` would always
  fail with "insufficient funds" — the side bet is now reserved first, then `all`
  takes whatever's left of your balance.

### `/equip bis`
New `bis:true` option auto-equips the best gear you own in every slot — highest
rarity you can actually use (level requirement met), durability as the tiebreak.
Handles two-handed weapons vs. one-hand-plus-shield sensibly instead of just always
picking a two-hander.

### Typing instead of only using menus
A batch of commands that used to force picking from a locked dropdown now also
accept typing the value directly (still show suggestions, just don't require
clicking one): roulette's bet type (`red`, `black`, `dozen1`, a bare number, etc.),
`/trade` and `/duel`'s currency, `/inventory`'s type, `/adventure`'s location, and
item names on `/equip`, `/repair`, `/store buy`, and `/arena-shop buy` (previously
those four *looked* typeable but actually only accepted an exact internal ID from
the menu — typing an item's real name now works).

---

*Older history isn't reconstructed here — this changelog starts from this point
forward. Going forward, add a dated entry above this line for each notable player-
facing change.*
