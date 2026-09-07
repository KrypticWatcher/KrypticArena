import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getItem, isEquipment, getStarterKitItems } from './data/items.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'economy.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id             TEXT PRIMARY KEY,
    currency_name        TEXT    NOT NULL DEFAULT 'Coins',
    currency_symbol      TEXT    NOT NULL DEFAULT '$',
    starting_cash        INTEGER NOT NULL DEFAULT 500,
    starting_bank        INTEGER NOT NULL DEFAULT 0,
    deck_count           INTEGER NOT NULL DEFAULT 2,
    created_at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    guild_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    cash            INTEGER NOT NULL DEFAULT 0,
    bank            INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS game_stats (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    game     TEXT NOT NULL,
    plays    INTEGER NOT NULL DEFAULT 0,
    wins     INTEGER NOT NULL DEFAULT 0,
    losses   INTEGER NOT NULL DEFAULT 0,
    pushes   INTEGER NOT NULL DEFAULT 0,
    net      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, game)
  );

  -- Arena Gladiator system: item ownership, currently-equipped gear, and
  -- named loadout presets. Item *definitions* live in code (src/data/items.js)
  -- — these tables only ever store item id strings, never item data.
  CREATE TABLE IF NOT EXISTS inventory (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    item_id  TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, item_id)
  );

  -- Three independent equipped-gear sets per player — Arena / Adventure /
  -- Misc (set_name) — not just one global loadout. See the equipment-table
  -- migration right after this exec block for how existing single-set rows
  -- get split across the 3 new ones on upgrade. Which set's effects apply
  -- where, and the weapon/starter-Hades cross-set fallback rules, live in
  -- utils/effects.js, not here — this table is just storage.
  CREATE TABLE IF NOT EXISTS equipment (
    guild_id       TEXT NOT NULL,
    user_id        TEXT NOT NULL,
    set_name       TEXT NOT NULL,
    helmet         TEXT,
    chest          TEXT,
    legs           TEXT,
    boots          TEXT,
    gloves         TEXT,
    main_hand      TEXT,
    off_hand       TEXT,
    arrows_item_id INTEGER,
    arrows_qty     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, set_name)
  );

  -- Cooldown tracking for the passive /claim reward on each collectible a
  -- player owns. One row per (guild, user, item) they've ever claimed from;
  -- no row yet just means "never claimed, so claim immediately available".
  CREATE TABLE IF NOT EXISTS collectible_claims (
    guild_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    last_claimed_at INTEGER NOT NULL DEFAULT 0,
    last_claimed_gambling_at INTEGER NOT NULL DEFAULT 0,
    last_claimed_arena_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS loadouts (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    helmet     TEXT,
    chest      TEXT,
    legs       TEXT,
    boots      TEXT,
    gloves     TEXT,
    main_hand  TEXT,
    off_hand   TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id, name)
  );

  -- Bot-wide custom permission bitfield (see utils/permissions.js) — the
  -- owner's own trust list, e.g. an ADMIN flag for people allowed to run
  -- admin commands, or a future Patreon-tier flag set by a webhook.
  -- Deliberately keyed by user_id ONLY, not guild_id: this mirrors
  -- OWNER_IDS (utils/owner.js), which is also global on purpose, and is
  -- what makes a Patreon-tier flag make sense at all — a subscription
  -- isn't tied to any one server.
  CREATE TABLE IF NOT EXISTS user_bitfields (
    user_id TEXT PRIMARY KEY,
    flags   INTEGER NOT NULL DEFAULT 0
  );

  -- Item instances (see utils/inventory.js) — one row per PHYSICAL COPY of
  -- an equipment item a player owns, each with its OWN durability. This
  -- replaces the old "shared bucket per item type" model: two Steel
  -- Swords are two separate rows here, so one can sit at 20% while the
  -- other stays at 100%, and the player picks which specific copy to
  -- equip/trade rather than always drawing from one pooled number.
  -- Collectables never get instances — no durability, no "which copy"
  -- concept — they stay in the quantity-based 'inventory' table above.
  -- durability is a PERCENTAGE (0-100, REAL for precise decay math — see
  -- DURABILITY_LOSS_PERCENT_BY_RARITY in data/items.js — rounded only for
  -- display). Ownership transfer (a trade) is just updating user_id;
  -- durability is untouched by that, which is what keeps a copy's wear
  -- state intact across a trade. equipment/loadouts slot columns now hold
  -- an instance_id (not an item_id) — "which literal sword is equipped/
  -- saved," not just "which kind."
  CREATE TABLE IF NOT EXISTS item_instances (
    instance_id TEXT PRIMARY KEY,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    durability  REAL NOT NULL DEFAULT 100,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_item_instances_owner ON item_instances(guild_id, user_id, item_id);

  -- The one currently-live "Repeat Trip" button per (guild, user) — see
  -- utils/adventureScheduler.js. Only ever one row per player: whichever
  -- Adventure-return message most recently posted one. Superseded any
  -- time a NEW trip starts for that player (by clicking it, or by a fresh
  -- manual /adventure start) — the old message's button gets greyed out
  -- and this row gets replaced/cleared. Also swept and greyed out after
  -- 24h of sitting unused (see checkStaleRepeatButtons), so a button
  -- never sits there clickable indefinitely.
  CREATE TABLE IF NOT EXISTS adventure_repeat_buttons (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id)
  );
  -- His ask: Repeat Trip buttons became universal — anyone can click
  -- ANY player's button, but it always repeats the CLICKER's own last
  -- sent trip, never the button-poster's. This is what makes that
  -- possible: one row per player recording their own most recent
  -- launch (location choice, if any — null/null means it was random;
  -- dart usage; and when it was sent). Updated on EVERY launch
  -- regardless of source (a direct /adventure or a repeat click both
  -- write here), so the 12h staleness window always reflects genuinely
  -- recent activity. location_line/location_tier are a matched pair —
  -- both null (random) or both set (a specific choice), never one
  -- without the other.
  CREATE TABLE IF NOT EXISTS adventure_last_settings (
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    location_line TEXT,
    location_tier TEXT,
    dart_used     INTEGER NOT NULL DEFAULT 0,
    sent_at       INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  -- Generic "last trip settings" record, one row per (user, trip type) -
  -- used by the "anyone can click Repeat Trip" feature across every
  -- skilling command and /slay (see utils/lastTripSettings.js).
  -- settings_json holds whatever shape that specific trip type needs
  -- (tier+quantity, productId+quantity, mobId+quantity, etc) - a click
  -- from ANY user looks up THEIR OWN last settings for that trip type,
  -- not whoever originally sent the message the button is attached to.
  CREATE TABLE IF NOT EXISTS last_trip_settings (
    user_id       TEXT NOT NULL,
    trip_type     TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    sent_at       INTEGER NOT NULL,
    PRIMARY KEY (user_id, trip_type)
  );
  -- Survives-a-restart record of a duel challenge between the moment the
  -- challenger's wager is escrowed and the moment it resolves (accept/
  -- decline/cancel/timeout). Same reasoning as pending_trades above — see
  -- utils/pendingDuels.js, checked once on every bot startup.
  CREATE TABLE IF NOT EXISTS pending_duels (
    duel_key      TEXT PRIMARY KEY,
    guild_id      TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    message_id    TEXT NOT NULL,
    challenger_id TEXT NOT NULL,
    opponent_id   TEXT NOT NULL,
    wager         INTEGER NOT NULL,
    currency      TEXT NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- One shared, multiplayer betting round per channel (see
  -- utils/roulette.js) — opens on the first /roulette bet in a channel
  -- with no currently-open round, extends by roulette_bet_window_seconds
  -- with every additional bet, capped at roulette_max_round_seconds from
  -- opened_at regardless of how many more bets keep coming in. 'resolved'
  -- is the atomic guard against double-resolving the same round (set to 1
  -- the instant resolution starts, before any payout is applied) — the
  -- in-memory setTimeout that triggers resolution doesn't survive a
  -- restart, so any round still resolved=0 after a restart is stale and
  -- gets refunded on startup (see recoverStrandedRouletteRounds in
  -- index.js), same safety pattern as pending_trades/pending_duels above.
  CREATE TABLE IF NOT EXISTS roulette_rounds (
    round_id   TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    opened_at  INTEGER NOT NULL,
    closes_at  INTEGER NOT NULL,
    resolved   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_roulette_rounds_open ON roulette_rounds(guild_id, channel_id, resolved);

  -- One row per individual bet within a round — a player can place
  -- several across the same open round (e.g. one on a number, one on a
  -- color), each tracked and settled separately. pick_number is only ever
  -- set when pick_type = 'number'; NULL for every other pick type.
  CREATE TABLE IF NOT EXISTS roulette_bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id    TEXT NOT NULL,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    pick_type   TEXT NOT NULL,
    pick_number INTEGER,
    placed_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_roulette_bets_round ON roulette_bets(round_id);

  -- Bot-wide user ban — owner-only (managed via /owner's Blacklist
  -- screens, commands/owner/owner.js), deliberately separate from
  -- per-guild admin permissions: a blacklisted
  -- user is blocked from every interaction (commands, buttons, selects,
  -- modals) in every server the bot is in, checked once at the very top
  -- of index.js's interactionCreate handler before any routing happens.
  CREATE TABLE IF NOT EXISTS blacklisted_users (
    user_id        TEXT PRIMARY KEY,
    reason         TEXT,
    blacklisted_by TEXT NOT NULL,
    blacklisted_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- Per-guild gladiator-name word filter (see utils/nameFilter.js and
  -- commands/mod/mod.js) — mod-managed (admins too), empty by default. Two
  -- match types: 'wildcard' blocks the word appearing ANYWHERE in a name
  -- (substring match, catches it embedded inside other text), 'exact'
  -- only blocks it as a genuine standalone word (word-boundary match).
  -- Checked inside validateName in utils/gladiator.js, which both the
  -- auto-created starting name AND the deliberate /gladiator rename
  -- funnel through — the auto-created path already had a safe fallback
  -- to a generic name on ANY validation failure before this was added,
  -- so a flagged Discord display name degrades gracefully instead of
  -- blocking profile creation; a deliberate rename attempt gets a clear
  -- rejection instead.
  CREATE TABLE IF NOT EXISTS banned_name_words (
    guild_id   TEXT NOT NULL,
    word       TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('wildcard', 'exact')),
    added_by   TEXT NOT NULL,
    added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, word, match_type)
  );

  -- Survives-a-restart record of a trade offer between the moment its
  -- initiator's side is escrowed and the moment it resolves (accept/
  -- decline/cancel/timeout). Without this, a restart mid-offer would
  -- silently strand the initiator's already-debited cash/arena coins/
  -- collectables with nothing left to refund them — see utils/
  -- pendingTrades.js, checked once on every bot startup. Equipment
  -- instances don't need anything written here to recover: unlike
  -- currency/collectables, an offered instance is only LOCKED (in-memory,
  -- see utils/inventory.js), never actually moved, until the trade
  -- resolves — so it's already sitting right where it was, no refund
  -- needed, the lock itself just evaporates with the old process. This
  -- table exists purely for the currency/collectables side, plus enough
  -- context (channel/message) to leave a note on the dead offer.
  CREATE TABLE IF NOT EXISTS pending_trades (
    trade_key    TEXT PRIMARY KEY,
    guild_id     TEXT NOT NULL,
    channel_id   TEXT NOT NULL,
    message_id   TEXT NOT NULL,
    initiator_id TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    send_side_json TEXT NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- /sell confirmation escrow — see utils/pendingSells.js. Items are
  -- removed from inventory the moment /sell is first submitted (matching
  -- pending_trades' own escrowSide/refundSide pattern exactly, his
  -- explicit ask to "follow our escrow system") — Confirm finalizes the
  -- sale (items stay gone, currency is granted), Cancel refunds them
  -- back. Never left ambiguous whether the items are "still theirs" or
  -- not while a confirmation is pending — they're already gone from
  -- inventory either way, same anti-dupe reasoning trades already rely
  -- on.
  CREATE TABLE IF NOT EXISTS pending_sells (
    sell_key   TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    items_json TEXT NOT NULL,
    arena_value INTEGER NOT NULL,
    cash_value  INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- Runtime-managed custom /inventory backgrounds — replaces the old
  -- static-code-file registry (data/inventoryBackgrounds.js is gone).
  -- Added via /owner's panel: paste a Discord image URL + a name, the
  -- bot downloads and saves it to src/assets/inventory-backgrounds/
  -- itself (see utils/inventoryBackgrounds.js) rather than trusting the
  -- URL to still resolve later — Discord attachment links can be
  -- signed/expiring for newer uploads. Global, not per-guild (an image
  -- file on disk has no natural guild scope) — id is bot-generated, name
  -- is what shows in /inventory_bg's dropdown.
  CREATE TABLE IF NOT EXISTS inventory_backgrounds (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    file_name   TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- Per-user grants for the table above — many-to-many on purpose (his
  -- own framing: T7 might get one background everyone on that tier
  -- shares, OR a specific player might get a unique one-off nobody else
  -- has — same grant mechanism covers both, just how many rows get
  -- inserted for a given background).
  CREATE TABLE IF NOT EXISTS inventory_background_access (
    background_id TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    granted_by    TEXT NOT NULL,
    granted_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    -- 'inventory' | 'gear' | 'both' — which surface(s) this grant unlocks
    -- the background for. See utils/inventoryBackgrounds.js.
    surface       TEXT NOT NULL DEFAULT 'both',
    PRIMARY KEY (background_id, user_id)
  );

  -- Generic per-player display/behavior toggles — see /user_flags and
  -- utils/userFlags.js. Deliberately a flag_name/enabled row per toggle
  -- rather than a dedicated column per flag on gladiators, since this is
  -- meant to grow over time (full_inventory is the first, not the last)
  -- without a schema migration every time a new one gets added. Global
  -- per-user (not per-guild) — a display preference like "always show
  -- inventory at full size" has no natural reason to differ server to
  -- server for the same player.
  CREATE TABLE IF NOT EXISTS user_flags (
    user_id   TEXT NOT NULL,
    flag_name TEXT NOT NULL,
    enabled   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, flag_name)
  );

  -- Boss Challenge system (/challenge — see utils/bossChallenges.js).
  -- Permanent per-player, per-boss progress — never resets on its own,
  -- only via an explicit admin reset command. Global (not per-guild),
  -- matching how gladiator progress/currency already works bot-wide
  -- rather than per-server.
  --
  -- kills: how many times this boss has been fully "defeated" (per his
  -- spec, no boss is ever truly killed — Hades resurrects them; only
  -- counts toward unlocking the NEXT boss in the domain and toward this
  -- boss's own re-challengeable completion count) — this is the number
  -- gating progression to whatever boss requires N kills of this one.
  --
  -- progress: how many of the required consecutive successful
  -- adventures toward the CURRENT in-progress kill this player has
  -- banked so far (bosses 3-5 require multiple full adventure sends to
  -- land one kill — 2/3/5 respectively per his spec). Resets to 0 the
  -- moment a kill actually lands (progress becomes a kill, not additive
  -- with the next attempt). A boss requiring only 1 adventure (bosses 1
  -- and 2) never has progress sit above 0 for more than an instant.
  CREATE TABLE IF NOT EXISTS boss_kills (
    user_id   TEXT NOT NULL,
    boss_id   TEXT NOT NULL,
    kills     INTEGER NOT NULL DEFAULT 0,
    progress  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, boss_id)
  );

  -- The 16-skill system's own XP tracking - one row per (guild, user,
  -- skill), same "one row per named thing" shape the equipment table
  -- already uses. No row for a given skill just means level 1 / 0 XP.
  CREATE TABLE IF NOT EXISTS skill_xp (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    xp       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, skill_id)
  );

  -- /slay (mob-hunt) kill counts, per-mob - drives the KC-decay death
  -- chance curve, per individual mob rather than per boss. Kills
  -- increments by however many a single trip actually lands, not always
  -- by 1 (this whole system is per-trip, many kills at once).
  CREATE TABLE IF NOT EXISTS mob_kills (
    user_id  TEXT NOT NULL,
    mob_id   TEXT NOT NULL,
    kills    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, mob_id)
  );

  -- Farming - genuinely different from every other skill's single-trip
  -- shape: multiple independent patches growing in parallel on real-time
  -- timers, not reusing the shared adventure_* trip columns at all,
  -- since a player can have several patches growing while also out on
  -- an unrelated trip elsewhere. patch_type is 'herb'/'tree'/'fruit',
  -- patch_index is which of the player's own N patches of that type
  -- this is. seed_item_id is null for an empty/unplanted patch.
  CREATE TABLE IF NOT EXISTS farming_patches (
    user_id       TEXT NOT NULL,
    patch_type    TEXT NOT NULL,
    patch_index   INTEGER NOT NULL,
    seed_item_id  INTEGER,
    planted_at    INTEGER,
    ready_at      INTEGER,
    PRIMARY KEY (user_id, patch_type, patch_index)
  );

  -- Construction - 10 projects (one per gathering/production skill,
  -- including Farming). current_tier is how many of the project's 5
  -- tiers are FULLY complete (0-5), trips_done_this_tier tracks progress
  -- toward the next tier's own required trip count - resets to 0 each
  -- time a tier completes.
  CREATE TABLE IF NOT EXISTS construction_projects (
    user_id               TEXT NOT NULL,
    project_id            TEXT NOT NULL,
    current_tier          INTEGER NOT NULL DEFAULT 0,
    trips_done_this_tier  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, project_id)
  );

  -- ---------- Collection Log (/cl) ----------
  -- Permanent, ever-only-increasing record of every trackable item a
  -- player has EVER obtained — see utils/collectionLog.js. Deliberately
  -- separate from item_instances/inventory (which reflect CURRENT
  -- ownership and shrink when something's sold/traded/consumed) — his
  -- explicit spec: "if u no longer own the item, the quantity in ur
  -- collection log doesnt decrease." Global (not per-guild), matching
  -- every other permanent-progress table this system already uses
  -- (boss_kills, etc.) rather than per-server. Only ever written to via
  -- recordCollectionLogObtain — never decremented, never deleted except
  -- by an explicit admin reset.
  CREATE TABLE IF NOT EXISTS collection_log (
    user_id    TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    quantity   INTEGER NOT NULL DEFAULT 0,
    first_obtained_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (user_id, item_id)
  );

  -- Per-tier Adventure completion counter — the "Kills: N" equivalent
  -- for Adventure-tier collection log pages, which (unlike bosses) had
  -- no existing per-tier counter anywhere before this. Increments once
  -- per SUCCESSFUL Adventure return (matching how a boss "kill" only
  -- counts a win, not every attempt) — tier is whichever of the 6
  -- rarity tiers that trip's rolled location belongs to (see
  -- LOCATION_TIER in utils/adventureFlavor.js).
  CREATE TABLE IF NOT EXISTS adventure_tier_completions (
    user_id  TEXT NOT NULL,
    tier     TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, tier)
  );

  -- Every mutating admin action, ever — who did what to whom. Nothing in
  -- this bot logged admin actions before this (admin-money/admin-item
  -- could move huge amounts of currency/items with zero record of it),
  -- which is exactly the gap this closes. 'action' is a short dot-path
  -- string ('money.add', 'item.grant', 'gladiator.xp.set', etc.) rather
  -- than free text, so entries are filterable/groupable later without
  -- parsing prose. 'details' is a short human-readable summary (what
  -- changed, before/after where relevant) — enough to read at a glance in
  -- /admin's audit view, not a full structured dump. target_id is NULL
  -- for actions with no single player target (e.g. a guild-wide setting
  -- change). Never pruned automatically — small enough at this bot's
  -- scale that there's no reason to throw history away.
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    actor_id   TEXT NOT NULL,
    action     TEXT NOT NULL,
    target_id  TEXT,
    details    TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_log_guild ON admin_audit_log(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(guild_id, target_id, created_at);

  -- Trading Post's 1% tax is a pure currency sink (his explicit call —
  -- the taxed amount just vanishes, never accumulates anywhere
  -- spendable) — this table exists purely so /taxes (mod+ only) can
  -- report how much has been removed from the economy this way. One
  -- row per guild, since arena coins themselves are per-guild (see
  -- users.arena_coins). recordTradingPostTax/getTradingPostTaxTotal in
  -- utils/tradingPost.js are the only things that touch this.
  CREATE TABLE IF NOT EXISTS trading_post_tax (
    guild_id        TEXT PRIMARY KEY,
    total_collected INTEGER NOT NULL DEFAULT 0
  );

  -- Trading Post listings — item-for-arena-coins only (his explicit
  -- call, distinct from /trade which handles arbitrary item+currency
  -- escrow between two named players). One row per listing, buy or
  -- sell, quantity-based/stackable like an OSRS Grand Exchange order —
  -- price_per_unit is always PER UNIT (his spec: "600 elixirs for 2k
  -- EACH"), quantity_remaining ticks down as the matching engine fills
  -- it (not built yet). status stays 'active' rows kept even once
  -- 'fulfilled'/'cancelled' rather than deleted — this doubles as the
  -- price-history source for the suggested-price hint when posting a
  -- new listing (top 20 most recent fulfilled sells/buys per item).
  CREATE TABLE IF NOT EXISTS trading_post_listings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id            TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    side                TEXT NOT NULL, -- 'sell' | 'buy'
    item_id             TEXT NOT NULL,
    -- Set only for an equipment SELL listing — the specific physical
    -- copy escrowed (see TRADING_POST_ESCROW_USER_ID in
    -- utils/tradingPost.js), since equipment is per-instance (its own
    -- durability) rather than a fungible stack like a collectable. Null
    -- for every collectable listing and every buy listing (a buy offer
    -- isn't tied to any specific future copy).
    instance_id         TEXT,
    price_per_unit      INTEGER NOT NULL,
    quantity_total      INTEGER NOT NULL,
    quantity_remaining  INTEGER NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active', -- 'active' | 'fulfilled' | 'cancelled'
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tp_listings_user ON trading_post_listings(guild_id, user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tp_listings_browse ON trading_post_listings(guild_id, side, item_id, status);

  -- Trading Post lockdown switch (his admin kill-switch ask) — one row
  -- per guild, locked = 0/1. Checked at the top of every /tp
  -- subcommand before anything else runs.
  CREATE TABLE IF NOT EXISTS trading_post_lock (
    guild_id TEXT PRIMARY KEY,
    locked   INTEGER NOT NULL DEFAULT 0
  );

  -- Elixir purchase rate limit (his explicit ask: max 40 per 3-hour
  -- window) — his stated reasoning is this makes Elixir a real bulk-
  -- sellable good on the Trading Post/between players (worth more than
  -- the store's per-unit price to someone who's hit their window but
  -- still wants more right now) rather than something everyone can
  -- always just buy unlimited amounts of directly. A fixed-window
  -- bucket (not a rolling log of individual purchases) — window_started_at
  -- resets to now and purchased_in_window resets to 0 the first time a
  -- purchase happens after the previous window has fully elapsed.
  CREATE TABLE IF NOT EXISTS elixir_purchase_limit (
    guild_id            TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    window_started_at   INTEGER NOT NULL DEFAULT 0,
    purchased_in_window INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Beast Pits store purchase cap — his ask, 5 pets per player per
  -- 4-day window. Exact same fixed-window-bucket shape as
  -- elixir_purchase_limit above (not a rolling log of individual
  -- purchases) — a window resets the first time a purchase happens
  -- after the previous one's fully elapsed.
  CREATE TABLE IF NOT EXISTS pet_purchase_limit (
    guild_id            TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    window_started_at   INTEGER NOT NULL DEFAULT 0,
    purchased_in_window INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  -- Beast Pits bot-fight daily cap — his follow-up ask, a second lever
  -- on top of the win-rate rebalance rather than touching those numbers
  -- again: max 3 bot fights per PET INSTANCE per day, not per player.
  -- Keyed by pets.instance_id specifically (already a globally unique
  -- id on its own, no guild_id/user_id needed in the key) — his
  -- explicit emphasis: a player with 4 separate Mythical pets gets
  -- 3x4=12 Mythical-tier bot fights a day, not a shared player-wide
  -- cap that a second identical pet would do nothing to raise. Only
  -- applies to the bot-fight mode — the player-vs-player pet challenge
  -- doesn't use win% at all (pure stat combat), so this table doesn't
  -- touch it.
  CREATE TABLE IF NOT EXISTS pet_daily_fight_limit (
    instance_id       TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL DEFAULT 0,
    fights_in_window  INTEGER NOT NULL DEFAULT 0
  );

  -- One row per ATTACKER — a general cooldown after ANY heist attempt
  -- (not per-target), regardless of outcome. Same-target blocking is now
  -- its own separate table below (heist_target_locks) — this one only
  -- ever drives the general cooldown.
  CREATE TABLE IF NOT EXISTS heist_attempts (
    guild_id            TEXT NOT NULL,
    attacker_user_id    TEXT NOT NULL,
    last_attempt_at     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, attacker_user_id)
  );

  -- One row per (attacker, target) PAIR ever heisted, locked_at = the
  -- moment of that attempt. Drives the 24h same-target block (see
  -- isRepeatTarget, heistAttempts.js) as a durable per-pair record —
  -- his fix: hitting a DIFFERENT target in between no longer resets or
  -- bypasses the block on the one you actually want to avoid, unlike
  -- the earlier "remembers only your most recent target" design. Rows
  -- older than the block window are just ignored, never cleaned up
  -- (cheap enough to keep — pruning can be added later if this table
  -- ever gets large).
  CREATE TABLE IF NOT EXISTS heist_target_locks (
    guild_id          TEXT NOT NULL,
    attacker_user_id  TEXT NOT NULL,
    target_user_id    TEXT NOT NULL,
    locked_at         INTEGER NOT NULL,
    PRIMARY KEY (guild_id, attacker_user_id, target_user_id)
  );

  -- One row per IN-PROGRESS heist — his 30-45 min async design, same
  -- shape as an Adventure's own pending-trip timer. snapshot_amount is
  -- locked in at launch (see computeStealAmount) and never
  -- recomputed — attacker_total/target_total are ALSO captured at
  -- launch time, since the success-chance roll itself happens at
  -- RESOLUTION, not launch, and needs a consistent wealth comparison
  -- rather than whatever either balance happens to be by then.
  -- tool_id/has_vault_cracker are locked in at launch too — what the
  -- attacker brought doesn't change mid-heist.
  -- His ask: Deposit Box tiers now survive multiple blocked heist
  -- attempts before breaking (T1=1, T2=2, T3=3) instead of every tier
  -- being single-use. Tracks the CURRENTLY-ACTIVE box's remaining
  -- charges per tier per player — inventory quantity (item_instances/
  -- inventory table) still tracks how many SPARE boxes of that tier
  -- they own in reserve; this table is just "how many more blocks does
  -- the one currently in use have left." When charges hit 0, the
  -- active box breaks (inventory quantity -1) and, if another spare of
  -- that tier is still owned, a fresh one takes over with a full
  -- charge count again — see utils/heistResolution.js for the actual
  -- consume/refresh logic. No row at all means "hasn't been used yet
  -- since last obtained" (a fresh box), not "0 charges" — the caller
  -- treats a missing row as full charges for that tier.
  CREATE TABLE IF NOT EXISTS heist_box_charges (
    guild_id          TEXT NOT NULL,
    user_id           TEXT NOT NULL,
    tier_id           TEXT NOT NULL,
    charges_remaining INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, tier_id)
  );

  CREATE TABLE IF NOT EXISTS heist_pending (
    guild_id            TEXT NOT NULL,
    attacker_user_id    TEXT NOT NULL,
    target_user_id      TEXT NOT NULL,
    channel_id          TEXT NOT NULL,
    tool_id             TEXT,
    has_vault_cracker    INTEGER NOT NULL DEFAULT 0,
    has_forged_documents INTEGER NOT NULL DEFAULT 0,
    snapshot_amount      INTEGER NOT NULL,
    attacker_total       INTEGER NOT NULL,
    target_total         INTEGER NOT NULL,
    started_at           INTEGER NOT NULL,
    resolves_at           INTEGER NOT NULL,
    PRIMARY KEY (guild_id, attacker_user_id)
  );

`);

const heistAttemptsColumns = db.prepare("PRAGMA table_info(heist_attempts)").all().map((c) => c.name);
if (heistAttemptsColumns.includes('target_user_id')) {
  db.exec('DROP TABLE heist_attempts');
  db.exec(`
    CREATE TABLE heist_attempts (
      guild_id            TEXT NOT NULL,
      attacker_user_id    TEXT NOT NULL,
      last_attempt_at     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, attacker_user_id)
    )
  `);
}

const heistAttemptsColumnsNow = db.prepare("PRAGMA table_info(heist_attempts)").all().map((c) => c.name);
if (heistAttemptsColumnsNow.includes('last_target_user_id')) {
  db.exec('ALTER TABLE heist_attempts DROP COLUMN last_target_user_id');
}
if (heistAttemptsColumnsNow.includes('last_target_at')) {
  db.exec('ALTER TABLE heist_attempts DROP COLUMN last_target_at');
}

db.exec(`
  -- One row per equipment instance escrowed into a Trading Post
  -- listing — replaces the old single-instance_id-column design now
  -- that equipment listings can hold more than one copy at once (his
  -- follow-up: since only 100%-durability equipment is postable, a
  -- multi-copy listing is genuinely fungible, no per-copy durability
  -- variance to worry about anymore). trading_post_listings.instance_id
  -- stays as a column for now but is unused going forward — this table
  -- is the real source of truth for which physical copies a listing
  -- holds.
  CREATE TABLE IF NOT EXISTS trading_post_listing_instances (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  INTEGER NOT NULL,
    instance_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tp_listing_instances ON trading_post_listing_instances(listing_id);

  -- Every completed Trading Post fill, logged for the price-suggestion
  -- hint (his original spec: suggest a price based on the 20 most
  -- recent completed transactions, tracked SEPARATELY for sell-
  -- triggered vs buy-triggered fills — see utils/tradingPostMatching.js,
  -- which inserts one row per fill). triggering_side is whichever
  -- action (a new /tp sell or /tp buy posting) caused this match, NOT
  -- which side was resting — a sell-triggered fill transacts at the
  -- resting BUY's price, a buy-triggered fill transacts at the resting
  -- SELL's price, so the two really do tend to cluster around
  -- different numbers over time, not just be the same data twice.
  -- triggering_side/price_per_unit/quantity feed getSuggestedPrice in
  -- utils/tradingPost.js. buyer_user_id/seller_user_id exist specifically
  -- to let that function detect price manipulation — two colluding
  -- accounts trading an untraded item back and forth to plant whatever
  -- price they want. Without knowing WHO was on each side, there was no
  -- way to tell "20 trades across a real market" apart from "20 trades
  -- between the same 2 people" at all — see getSuggestedPrice for how
  -- these get used (collapsed to one data point per distinct trading
  -- pair, with a minimum number of distinct pairs required at all).
  CREATE TABLE IF NOT EXISTS trading_post_trade_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    item_id          TEXT NOT NULL,
    triggering_side  TEXT NOT NULL, -- 'sell' | 'buy'
    price_per_unit   INTEGER NOT NULL,
    quantity         INTEGER NOT NULL,
    buyer_user_id    TEXT NOT NULL DEFAULT '',
    seller_user_id   TEXT NOT NULL DEFAULT '',
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tp_trade_history ON trading_post_trade_history(guild_id, item_id, triggering_side, created_at);

  -- Small generic global key/value store — starts with just the "main
  -- server" ID (see utils/botConfig.js), the one thing gating /config,
  -- /owner, and /system to a single Discord server as the bot converts
  -- to a shared global economy across every server it's in. Owner-
  -- settable at runtime (his ask — changeable without a code change or
  -- redeploy), not an env var/hardcoded constant. Room for other
  -- genuinely-bot-wide settings later (e.g. a single global currency
  -- symbol) without a new table each time.
  CREATE TABLE IF NOT EXISTS bot_config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- ---------- Pending trip-result deliveries (retry queue) ----------
  -- A trip result (Adventure/Champion/Boss/Slay/every skilling type) is
  -- resolved (rewards granted, trip cleared) and THEN posted to Discord
  -- as two separate steps in checkDueAdventures — if the post fails for
  -- any reason (the bot's own network being down at that exact 30s
  -- poll, a transient Discord API error, etc), the reward had already
  -- been applied, so without this table the result message was just
  -- lost forever with nothing to retry. Rows here get retried on every
  -- checkDueAdventures tick (and once immediately on bot startup, to
  -- also cover the case where the whole process was down, not just the
  -- network) until they succeed or attempts hits the give-up cap — see
  -- flushPendingDeliveries in utils/adventureScheduler.js. Only plain
  -- text content is persisted (not components/files) since a trip's
  -- "Repeat Trip" button and any loot-preview image are regenerated
  -- fresh at delivery time / not worth serializing for a retry path.
  CREATE TABLE IF NOT EXISTS pending_trip_deliveries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    content     TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  -- ---------- Beast Pits ----------
  -- One row per owned pet — see utils/pets.js and data/pets.js. Modeled
  -- on item_instances (global instance_id, guild_id always GLOBAL_ID
  -- like every other player-data table since the global-economy
  -- conversion) rather than a stack, since every pet is a genuinely
  -- distinct individual with its own rolled stats/level/win-rate, never
  -- fungible with another copy of the same species the way a
  -- collectable item is.
  --
  -- given_name is the auto-generated unique name every pet gets the
  -- moment it's obtained (his ask — never just "Bear", always a proper
  -- name) — nickname is the optional player-set override on top of
  -- that, species_id is always shown alongside either one in fight/
  -- challenge text so an opponent always knows what they're actually
  -- facing regardless of naming.
  --
  -- attack/defense/vitality/speed are the CURRENT rolled stat values —
  -- rerolled fresh (not preserved) on a Trading Post/direct trade transfer,
  -- per his explicit call, using the same rarity-based roll logic as a
  -- brand new pet of that species.
  --
  -- win_rate is the Beast Pits bot-fight stat specifically (starts at
  -- the species' rarity-based base, +1-ish per bot-fight win, resets
  -- toward 0 on a loss) — deliberately separate from the 4 combat
  -- stats above, which drive PvP only. cooldown_until is set once
  -- win_rate bottoms out at 0 (his ask: no death, just a
  -- rarity-scaled recovery window — see RECOVERY_DAYS_BY_RARITY in
  -- data/pets.js) — both the bot-fight AND PvP challenge commands
  -- should refuse to use a pet still on cooldown.
  --
  -- stat_focus_id is which consumable effect (if any) is currently
  -- steering level-up stat gains — null means an even/random split
  -- across all four. level/xp use the SAME curve/formula as Gladiator
  -- XP (see utils/xp.js) at 75% of the required amount per level, capped
  -- at 20 instead of 99 (his ask — "quite a bit, not quick" to max out,
  -- but a fundamentally smaller journey than a Gladiator's own).
  CREATE TABLE IF NOT EXISTS pets (
    instance_id     TEXT PRIMARY KEY,
    guild_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    species_id      TEXT NOT NULL,
    rarity          TEXT NOT NULL,
    given_name      TEXT NOT NULL,
    nickname        TEXT,
    level           INTEGER NOT NULL DEFAULT 1,
    xp              INTEGER NOT NULL DEFAULT 0,
    attack          INTEGER NOT NULL,
    defense         INTEGER NOT NULL,
    vitality        INTEGER NOT NULL,
    speed           INTEGER NOT NULL,
    win_rate        REAL NOT NULL,
    cooldown_until  INTEGER NOT NULL DEFAULT 0,
    stat_focus_id   TEXT,
    is_shiny        INTEGER NOT NULL DEFAULT 0,
    shiny_ability_percent REAL,
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(guild_id, user_id);

  -- One named Gladiator per (guild, user) — see utils/gladiator.js. Level
  -- is deliberately NOT stored here, only xp — level is always derived
  -- from xp via utils/xp.js so it can never drift out of sync with the
  -- curve (same "computed, not stored" approach as arena ranks). The two
  -- adventure_* columns are 0 when not currently on an adventure; once
  -- /adventure exists, they gate re-launching a new one and (per design)
  -- lock /champion — but never /duel or /blackjack, which stay usable
  -- while a gladiator is away.
  CREATE TABLE IF NOT EXISTS gladiators (
    guild_id            TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    name                TEXT NOT NULL,
    xp                  INTEGER NOT NULL DEFAULT 0,
    adventure_started_at INTEGER NOT NULL DEFAULT 0,
    adventure_ends_at    INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id)
  );
`);

const guildColumns = db.prepare("PRAGMA table_info(guild_settings)").all().map((c) => c.name);
if (!guildColumns.includes('deck_count')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN deck_count INTEGER NOT NULL DEFAULT 2');
}

if (guildColumns.includes('rob_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_cooldown_seconds');
}

if (!guildColumns.includes('slave_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_cooldown_seconds INTEGER NOT NULL DEFAULT 1800');
}
if (!guildColumns.includes('slave_gambling_min')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_gambling_min INTEGER NOT NULL DEFAULT 10000');
}
if (!guildColumns.includes('slave_gambling_max')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_gambling_max INTEGER NOT NULL DEFAULT 15000');
}

if (!guildColumns.includes('slave_arena_min')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_arena_min INTEGER NOT NULL DEFAULT 50');
}
if (!guildColumns.includes('slave_arena_max')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_arena_max INTEGER NOT NULL DEFAULT 100');
}
if (!guildColumns.includes('slave_arena_daily_cap')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slave_arena_daily_cap INTEGER NOT NULL DEFAULT 400');
}

if (!guildColumns.includes('claim_cooldown_arena_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN claim_cooldown_arena_seconds INTEGER NOT NULL DEFAULT 14400');
}
if (!guildColumns.includes('claim_cooldown_gambling_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN claim_cooldown_gambling_seconds INTEGER NOT NULL DEFAULT 7200');
}
if (!guildColumns.includes('claim_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN claim_cooldown_seconds INTEGER NOT NULL DEFAULT 10800');
}

const collectibleClaimsColumns = db.prepare("PRAGMA table_info(collectible_claims)").all().map((c) => c.name);
if (!collectibleClaimsColumns.includes('last_claimed_gambling_at')) {
  db.exec('ALTER TABLE collectible_claims ADD COLUMN last_claimed_gambling_at INTEGER NOT NULL DEFAULT 0');
}
if (!collectibleClaimsColumns.includes('last_claimed_arena_at')) {
  db.exec('ALTER TABLE collectible_claims ADD COLUMN last_claimed_arena_at INTEGER NOT NULL DEFAULT 0');
}

if (!guildColumns.includes('exchange_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN exchange_cooldown_seconds INTEGER NOT NULL DEFAULT 0');
}
if (!guildColumns.includes('exchange_daily_cap')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN exchange_daily_cap INTEGER NOT NULL DEFAULT 2000');
}

if (guildColumns.includes('rob_base_chance_pct')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_base_chance_pct');
}
if (guildColumns.includes('rob_min_chance_pct')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_min_chance_pct');
}
if (guildColumns.includes('rob_max_chance_pct')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_max_chance_pct');
}
if (guildColumns.includes('rob_steal_min_pct')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_steal_min_pct');
}
if (guildColumns.includes('rob_steal_max_pct')) {
  db.exec('ALTER TABLE guild_settings DROP COLUMN rob_steal_max_pct');
}

if (!guildColumns.includes('champion_min_wager')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN champion_min_wager INTEGER NOT NULL DEFAULT 500');
}

const CHAMPION_BRACKET_MAX_WAGER_DEFAULTS = [2000, 5000, 15000, 50000, 150000, 500000];
CHAMPION_BRACKET_MAX_WAGER_DEFAULTS.forEach((defaultValue, i) => {
  const column = `champion_bracket_${i + 1}_max_wager`;
  if (!guildColumns.includes(column)) {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column} INTEGER NOT NULL DEFAULT ${defaultValue}`);
  }
});

const CHAMPION_BRACKET_XP_BONUS_DEFAULTS = [0, 0, 5, 10, 15, 25];
CHAMPION_BRACKET_XP_BONUS_DEFAULTS.forEach((defaultValue, i) => {
  const column = `champion_bracket_${i + 1}_xp_bonus`;
  if (!guildColumns.includes(column)) {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column} INTEGER NOT NULL DEFAULT ${defaultValue}`);
  }
});

const CHAMPION_BRACKET_BASE_XP_DEFAULTS = [10, 25, 60, 250, 1100, 6700];
CHAMPION_BRACKET_BASE_XP_DEFAULTS.forEach((defaultValue, i) => {
  const column = `champion_bracket_${i + 1}_base_xp`;
  if (!guildColumns.includes(column)) {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column} INTEGER NOT NULL DEFAULT ${defaultValue}`);
  }
});

for (let tier = 1; tier <= 7; tier++) {
  const column = `tier${tier}_role_id`;
  if (!guildColumns.includes(column)) {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column} TEXT`);
  }
}

if (!guildColumns.includes('adventure_base_minutes')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN adventure_base_minutes INTEGER NOT NULL DEFAULT 30');
}

if (!guildColumns.includes('blackjack_side_bets_enabled')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN blackjack_side_bets_enabled INTEGER NOT NULL DEFAULT 0');
}

if (!guildColumns.includes('roulette_bet_window_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN roulette_bet_window_seconds INTEGER NOT NULL DEFAULT 15');
}
if (!guildColumns.includes('roulette_max_round_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN roulette_max_round_seconds INTEGER NOT NULL DEFAULT 60');
}
if (!guildColumns.includes('roulette_min_bet')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN roulette_min_bet INTEGER NOT NULL DEFAULT 1');
}

if (!guildColumns.includes('slots_min_bet')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slots_min_bet INTEGER NOT NULL DEFAULT 1');
}
if (!guildColumns.includes('slots_payout_multiplier_pct')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slots_payout_multiplier_pct INTEGER NOT NULL DEFAULT 100');
}

if (!guildColumns.includes('dice_min_bet')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN dice_min_bet INTEGER NOT NULL DEFAULT 1');
}
if (!guildColumns.includes('dice_payout_multiplier_pct')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN dice_payout_multiplier_pct INTEGER NOT NULL DEFAULT 100');
}

if (!guildColumns.includes('blackjack_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN blackjack_cooldown_seconds INTEGER NOT NULL DEFAULT 3');
}
if (!guildColumns.includes('roulette_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN roulette_cooldown_seconds INTEGER NOT NULL DEFAULT 3');
}
if (!guildColumns.includes('dice_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN dice_cooldown_seconds INTEGER NOT NULL DEFAULT 3');
}
if (!guildColumns.includes('slots_cooldown_seconds')) {
  db.exec('ALTER TABLE guild_settings ADD COLUMN slots_cooldown_seconds INTEGER NOT NULL DEFAULT 3');
}

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (userColumns.includes('protected_until')) {
  db.exec('ALTER TABLE users DROP COLUMN protected_until');
}
if (userColumns.includes('last_rob_at')) {
  db.exec('ALTER TABLE users DROP COLUMN last_rob_at');
}

if (!userColumns.includes('arena_coins')) {
  db.exec('ALTER TABLE users ADD COLUMN arena_coins INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('arena_exchanged_today')) {
  db.exec('ALTER TABLE users ADD COLUMN arena_exchanged_today INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('arena_exchange_reset_at')) {
  db.exec('ALTER TABLE users ADD COLUMN arena_exchange_reset_at INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('last_slave_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_slave_at INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('last_blackjack_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_blackjack_at INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('last_roulette_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_roulette_at INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('last_dice_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_dice_at INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('last_slots_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_slots_at INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('slave_arena_today')) {
  db.exec('ALTER TABLE users ADD COLUMN slave_arena_today INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('slave_arena_reset_at')) {
  db.exec('ALTER TABLE users ADD COLUMN slave_arena_reset_at INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('starter_granted')) {
  db.exec('ALTER TABLE users ADD COLUMN starter_granted INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('last_exchange_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_exchange_at INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('vault_paid_until')) {
  db.exec('ALTER TABLE users ADD COLUMN vault_paid_until INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('security_camera_paid_until')) {
  db.exec('ALTER TABLE users ADD COLUMN security_camera_paid_until INTEGER NOT NULL DEFAULT 0');
}

if (!userColumns.includes('wealth_peak')) {
  db.exec('ALTER TABLE users ADD COLUMN wealth_peak INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.includes('wealth_peak_at')) {
  db.exec('ALTER TABLE users ADD COLUMN wealth_peak_at INTEGER NOT NULL DEFAULT 0');
}

const equipmentColumns = db.prepare('PRAGMA table_info(equipment)').all().map((c) => c.name);
if (equipmentColumns.includes('right_hand') && !equipmentColumns.includes('main_hand')) {
  db.exec('ALTER TABLE equipment RENAME COLUMN right_hand TO main_hand');
}
if (equipmentColumns.includes('left_hand') && !equipmentColumns.includes('off_hand')) {
  db.exec('ALTER TABLE equipment RENAME COLUMN left_hand TO off_hand');
}
if (!equipmentColumns.includes('arrows_item_id')) {
  db.exec('ALTER TABLE equipment ADD COLUMN arrows_item_id INTEGER');
}
if (!equipmentColumns.includes('arrows_qty')) {
  db.exec('ALTER TABLE equipment ADD COLUMN arrows_qty INTEGER NOT NULL DEFAULT 0');
}

const equipmentColumnsForSetMigration = db.prepare('PRAGMA table_info(equipment)').all().map((c) => c.name);
if (!equipmentColumnsForSetMigration.includes('set_name')) {
  db.exec('ALTER TABLE equipment RENAME TO equipment_pre_sets');
  db.exec(`
    CREATE TABLE equipment (
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      set_name   TEXT NOT NULL,
      helmet     TEXT,
      chest      TEXT,
      legs       TEXT,
      boots      TEXT,
      gloves     TEXT,
      main_hand  TEXT,
      off_hand   TEXT,
      PRIMARY KEY (guild_id, user_id, set_name)
    );
  `);

  const EQUIPMENT_SLOT_COLUMNS = ['helmet', 'chest', 'legs', 'boots', 'gloves', 'main_hand', 'off_hand'];
  const emptyBucket = () => ({ helmet: null, chest: null, legs: null, boots: null, gloves: null, main_hand: null, off_hand: null });
  function migrationSourceToSet(source) {
    if (source === 'arena_store') return 'arena';
    if (source === 'adventure') return 'adventure';
    return 'adventure';
  }

  const oldEquipmentRows = db.prepare('SELECT * FROM equipment_pre_sets').all();
  const stmtGetInstanceForMigration = db.prepare('SELECT item_id FROM item_instances WHERE instance_id = ?');
  const stmtInsertMigratedSet = db.prepare(`
    INSERT INTO equipment (guild_id, user_id, set_name, helmet, chest, legs, boots, gloves, main_hand, off_hand)
    VALUES (@guild_id, @user_id, @set_name, @helmet, @chest, @legs, @boots, @gloves, @main_hand, @off_hand)
  `);

  for (const oldRow of oldEquipmentRows) {
    const buckets = { arena: emptyBucket(), adventure: emptyBucket(), misc: emptyBucket() };
    for (const slotCol of EQUIPMENT_SLOT_COLUMNS) {
      const instanceId = oldRow[slotCol];
      if (!instanceId) continue;
      const instanceRow = stmtGetInstanceForMigration.get(instanceId);
      if (!instanceRow) continue;
      const item = getItem(instanceRow.item_id);
      buckets[migrationSourceToSet(item?.source)][slotCol] = instanceId;
    }
    for (const setName of ['arena', 'adventure', 'misc']) {
      stmtInsertMigratedSet.run({ guild_id: oldRow.guild_id, user_id: oldRow.user_id, set_name: setName, ...buckets[setName] });
    }
  }

  db.exec('DROP TABLE equipment_pre_sets');
  console.log(`Migrated ${oldEquipmentRows.length} player(s)' equipment into 3 gear sets each.`);
}

const loadoutColumns = db.prepare('PRAGMA table_info(loadouts)').all().map((c) => c.name);
if (loadoutColumns.includes('right_hand') && !loadoutColumns.includes('main_hand')) {
  db.exec('ALTER TABLE loadouts RENAME COLUMN right_hand TO main_hand');
}
if (loadoutColumns.includes('left_hand') && !loadoutColumns.includes('off_hand')) {
  db.exec('ALTER TABLE loadouts RENAME COLUMN left_hand TO off_hand');
}

const backgroundAccessColumns = db.prepare('PRAGMA table_info(inventory_background_access)').all().map((c) => c.name);
if (!backgroundAccessColumns.includes('surface')) {
  db.exec("ALTER TABLE inventory_background_access ADD COLUMN surface TEXT NOT NULL DEFAULT 'both'");
}

const inventoryBackgroundsColumns = db.prepare('PRAGMA table_info(inventory_backgrounds)').all().map((c) => c.name);
if (!inventoryBackgroundsColumns.includes('is_public')) {
  db.exec('ALTER TABLE inventory_backgrounds ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0');
}

const gladiatorColumns = db.prepare('PRAGMA table_info(gladiators)').all().map((c) => c.name);
if (!gladiatorColumns.includes('adventure_channel_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN adventure_channel_id TEXT');
}
if (!gladiatorColumns.includes('adventure_location')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN adventure_location TEXT');
}

if (!gladiatorColumns.includes('maxed_reward_granted')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN maxed_reward_granted INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('name_locked')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN name_locked INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('instant_trips')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN instant_trips INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('founder_title_enabled')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN founder_title_enabled INTEGER NOT NULL DEFAULT 1');
}

if (!gladiatorColumns.includes('adventure_dart_used')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN adventure_dart_used INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('inventory_bg_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN inventory_bg_id TEXT');
}
if (!gladiatorColumns.includes('gear_bg_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN gear_bg_id TEXT');
}

if (!gladiatorColumns.includes('beastpets_bg_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN beastpets_bg_id TEXT');
}

if (!gladiatorColumns.includes('pending_elixir_discount_percent')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN pending_elixir_discount_percent REAL');
}

const petColumns = db.prepare('PRAGMA table_info(pets)').all().map((c) => c.name);
if (!petColumns.includes('is_shiny')) {
  db.exec('ALTER TABLE pets ADD COLUMN is_shiny INTEGER NOT NULL DEFAULT 0');
}
if (!petColumns.includes('shiny_ability_percent')) {
  db.exec('ALTER TABLE pets ADD COLUMN shiny_ability_percent REAL');
}

if (!petColumns.includes('total_rest_until')) {
  db.exec('ALTER TABLE pets ADD COLUMN total_rest_until INTEGER NOT NULL DEFAULT 0');
}
if (!petColumns.includes('total_rest_started_at')) {
  db.exec('ALTER TABLE pets ADD COLUMN total_rest_started_at INTEGER NOT NULL DEFAULT 0');
}

if (!petColumns.includes('stat_focus_levels_remaining')) {
  db.exec('ALTER TABLE pets ADD COLUMN stat_focus_levels_remaining INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('active_boss_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN active_boss_id TEXT');
}

const repeatButtonColumns = db.prepare('PRAGMA table_info(adventure_repeat_buttons)').all().map((c) => c.name);
if (!repeatButtonColumns.includes('dart_used')) {
  db.exec('ALTER TABLE adventure_repeat_buttons ADD COLUMN dart_used INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('adventure_duration_minutes')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN adventure_duration_minutes INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('adventure_elixir_cost')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN adventure_elixir_cost INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('active_pet_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN active_pet_id TEXT');
}

if (!gladiatorColumns.includes('qp')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN qp INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('active_mob_id')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN active_mob_id TEXT');
}
if (!gladiatorColumns.includes('slay_quantity')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN slay_quantity INTEGER NOT NULL DEFAULT 0');
}

if (!gladiatorColumns.includes('farming_trip_json')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN farming_trip_json TEXT');
}

if (!gladiatorColumns.includes('slay_outcome_json')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN slay_outcome_json TEXT');
}

if (!gladiatorColumns.includes('tanning_outcome_json')) {
  db.exec('ALTER TABLE gladiators ADD COLUMN tanning_outcome_json TEXT');
}

const tpTradeHistoryColumns = db.prepare('PRAGMA table_info(trading_post_trade_history)').all().map((c) => c.name);
if (!tpTradeHistoryColumns.includes('buyer_user_id')) {
  db.exec("ALTER TABLE trading_post_trade_history ADD COLUMN buyer_user_id TEXT NOT NULL DEFAULT ''");
}
if (!tpTradeHistoryColumns.includes('seller_user_id')) {
  db.exec("ALTER TABLE trading_post_trade_history ADD COLUMN seller_user_id TEXT NOT NULL DEFAULT ''");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS last_gamble_bet (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    game       TEXT NOT NULL,
    options    TEXT NOT NULL,
    placed_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (guild_id, user_id)
  );
`);

const usersColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!usersColumns.includes('training_style')) {
  db.exec('ALTER TABLE users ADD COLUMN training_style TEXT');
}

export default db;

const legacyDurabilityTableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_durability'")
  .get();

if (legacyDurabilityTableExists) {

  const LEGACY_MAX_DURABILITY_BY_RARITY = {
    common: 20, uncommon: 30, rare: 45, epic: 65, legendary: 90, mythical: 130,
  };

  const migrate = db.transaction(() => {
    const invRows = db.prepare('SELECT * FROM inventory WHERE quantity > 0').all();
    const legacyDurability = db.prepare('SELECT * FROM item_durability').all();
    const legacyByKey = new Map(legacyDurability.map((r) => [`${r.guild_id}:${r.user_id}:${r.item_id}`, r.durability]));

    const stmtDeleteInvRow = db.prepare(
      'DELETE FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?'
    );
    const stmtInsertInstance = db.prepare(
      'INSERT INTO item_instances (instance_id, guild_id, user_id, item_id, durability) VALUES (?, ?, ?, ?, ?)'
    );
    const slotColumns = ['helmet', 'chest', 'legs', 'boots', 'gloves', 'main_hand', 'off_hand'];
    const stmtUpdateEquipmentSlot = (col) =>
      db.prepare(`UPDATE equipment SET ${col} = ? WHERE guild_id = ? AND user_id = ? AND ${col} = ?`);
    const stmtLoadoutRows = db.prepare('SELECT rowid, * FROM loadouts WHERE guild_id = ? AND user_id = ?');
    const stmtUpdateLoadoutSlot = (col) => db.prepare(`UPDATE loadouts SET ${col} = ? WHERE rowid = ?`);

    for (const row of invRows) {
      const item = getItem(row.item_id);
      if (!item || !isEquipment(item)) continue;

      const legacyKey = `${row.guild_id}:${row.user_id}:${row.item_id}`;
      const legacyPoints = legacyByKey.get(legacyKey);
      const legacyMax = LEGACY_MAX_DURABILITY_BY_RARITY[item.rarity] ?? null;
      const primaryDurability =
        legacyPoints !== undefined && legacyMax
          ? Math.max(0, Math.min(100, (legacyPoints / legacyMax) * 100))
          : 100;

      let primaryInstanceId = null;
      for (let i = 0; i < row.quantity; i++) {
        const instanceId = randomUUID();
        const durability = i === 0 ? primaryDurability : 100;
        stmtInsertInstance.run(instanceId, row.guild_id, row.user_id, row.item_id, durability);
        if (i === 0) primaryInstanceId = instanceId;
      }
      stmtDeleteInvRow.run(row.guild_id, row.user_id, row.item_id);

      for (const col of slotColumns) {
        stmtUpdateEquipmentSlot(col).run(primaryInstanceId, row.guild_id, row.user_id, row.item_id);
      }
      const loadoutRows = stmtLoadoutRows.all(row.guild_id, row.user_id);
      for (const lr of loadoutRows) {
        for (const col of slotColumns) {
          if (lr[col] === row.item_id) {
            stmtUpdateLoadoutSlot(col).run(primaryInstanceId, lr.rowid);
          }
        }
      }
    }

    db.exec('DROP TABLE item_durability');
  });

  migrate();
}

{
  const OLD_TO_NEW_ITEM_ID = [
  { oldId: 'novice_galea', newId: 'tiro_galea' },
  { oldId: 'novice_lorica', newId: 'tiro_lorica' },
  { oldId: 'novice_ocrea', newId: 'tiro_ocrea' },
  { oldId: 'novice_caligae', newId: 'tiro_caligae' },
  { oldId: 'novice_manica', newId: 'tiro_manica' },
  { oldId: 'murmillo_galea', newId: 'crixus_bulwark_galea' },
  { oldId: 'murmillo_lorica', newId: 'crixus_bulwark_lorica' },
  { oldId: 'murmillo_ocrea', newId: 'crixus_bulwark_ocrea' },
  { oldId: 'murmillo_caligae', newId: 'crixus_bulwark_caligae' },
  { oldId: 'murmillo_manica', newId: 'crixus_bulwark_manica' },
  { oldId: 'thraex_galea', newId: 'verus_ironhide_galea' },
  { oldId: 'thraex_lorica', newId: 'verus_ironhide_lorica' },
  { oldId: 'thraex_ocrea', newId: 'verus_ironhide_ocrea' },
  { oldId: 'thraex_caligae', newId: 'verus_ironhide_caligae' },
  { oldId: 'thraex_manica', newId: 'verus_ironhide_manica' },
  { oldId: 'secutor_galea', newId: 'flamma_reckoning_galea' },
  { oldId: 'secutor_lorica', newId: 'flamma_reckoning_lorica' },
  { oldId: 'secutor_ocrea', newId: 'flamma_reckoning_ocrea' },
  { oldId: 'secutor_caligae', newId: 'flamma_reckoning_caligae' },
  { oldId: 'secutor_manica', newId: 'flamma_reckoning_manica' },
  { oldId: 'hoplomachus_galea', newId: 'spartacus_defiance_galea' },
  { oldId: 'hoplomachus_lorica', newId: 'spartacus_defiance_lorica' },
  { oldId: 'hoplomachus_ocrea', newId: 'spartacus_defiance_ocrea' },
  { oldId: 'hoplomachus_caligae', newId: 'spartacus_defiance_caligae' },
  { oldId: 'hoplomachus_manica', newId: 'spartacus_defiance_manica' },
  { oldId: 'apprentice_venator_galea', newId: 'cursors_relay_galea' },
  { oldId: 'apprentice_venator_lorica', newId: 'cursors_relay_lorica' },
  { oldId: 'apprentice_venator_ocrea', newId: 'cursors_relay_ocrea' },
  { oldId: 'apprentice_venator_caligae', newId: 'cursors_relay_caligae' },
  { oldId: 'apprentice_venator_manica', newId: 'cursors_relay_manica' },
  { oldId: 'veteran_venator_galea', newId: 'atalantas_chase_galea' },
  { oldId: 'veteran_venator_lorica', newId: 'atalantas_chase_lorica' },
  { oldId: 'veteran_venator_ocrea', newId: 'atalantas_chase_ocrea' },
  { oldId: 'veteran_venator_caligae', newId: 'atalantas_chase_caligae' },
  { oldId: 'veteran_venator_manica', newId: 'atalantas_chase_manica' },
  { oldId: 'champions_venator_galea', newId: 'camillas_vanguard_galea' },
  { oldId: 'champions_venator_lorica', newId: 'camillas_vanguard_lorica' },
  { oldId: 'champions_venator_ocrea', newId: 'camillas_vanguard_ocrea' },
  { oldId: 'champions_venator_caligae', newId: 'camillas_vanguard_caligae' },
  { oldId: 'champions_venator_manica', newId: 'camillas_vanguard_manica' },
  { oldId: 'grandmaster_venator_galea', newId: 'perseus_flight_galea' },
  { oldId: 'grandmaster_venator_lorica', newId: 'perseus_flight_lorica' },
  { oldId: 'grandmaster_venator_ocrea', newId: 'perseus_flight_ocrea' },
  { oldId: 'grandmaster_venator_caligae', newId: 'perseus_flight_caligae' },
  { oldId: 'grandmaster_venator_manica', newId: 'perseus_flight_manica' },
  { oldId: 'mercurys_venator_galea', newId: 'mercurys_wing_galea' },
  { oldId: 'mercurys_venator_lorica', newId: 'mercurys_wing_lorica' },
  { oldId: 'mercurys_venator_ocrea', newId: 'mercurys_wing_ocrea' },
  { oldId: 'mercurys_venator_caligae', newId: 'mercurys_wing_caligae' },
  { oldId: 'mercurys_venator_manica', newId: 'mercurys_wing_manica' },
  { oldId: 'apprentice_bestiarius_galea', newId: 'venators_snare_galea' },
  { oldId: 'apprentice_bestiarius_lorica', newId: 'venators_snare_lorica' },
  { oldId: 'apprentice_bestiarius_ocrea', newId: 'venators_snare_ocrea' },
  { oldId: 'apprentice_bestiarius_caligae', newId: 'venators_snare_caligae' },
  { oldId: 'apprentice_bestiarius_manica', newId: 'venators_snare_manica' },
  { oldId: 'veteran_bestiarius_galea', newId: 'meleagers_hunt_galea' },
  { oldId: 'veteran_bestiarius_lorica', newId: 'meleagers_hunt_lorica' },
  { oldId: 'veteran_bestiarius_ocrea', newId: 'meleagers_hunt_ocrea' },
  { oldId: 'veteran_bestiarius_caligae', newId: 'meleagers_hunt_caligae' },
  { oldId: 'veteran_bestiarius_manica', newId: 'meleagers_hunt_manica' },
  { oldId: 'champions_bestiarius_galea', newId: 'orions_quarry_galea' },
  { oldId: 'champions_bestiarius_lorica', newId: 'orions_quarry_lorica' },
  { oldId: 'champions_bestiarius_ocrea', newId: 'orions_quarry_ocrea' },
  { oldId: 'champions_bestiarius_caligae', newId: 'orions_quarry_caligae' },
  { oldId: 'champions_bestiarius_manica', newId: 'orions_quarry_manica' },
  { oldId: 'grandmaster_bestiarius_galea', newId: 'actaeons_pursuit_galea' },
  { oldId: 'grandmaster_bestiarius_lorica', newId: 'actaeons_pursuit_lorica' },
  { oldId: 'grandmaster_bestiarius_ocrea', newId: 'actaeons_pursuit_ocrea' },
  { oldId: 'grandmaster_bestiarius_caligae', newId: 'actaeons_pursuit_caligae' },
  { oldId: 'grandmaster_bestiarius_manica', newId: 'actaeons_pursuit_manica' },
  { oldId: 'dianas_bestiarius_galea', newId: 'dianas_chase_galea' },
  { oldId: 'dianas_bestiarius_lorica', newId: 'dianas_chase_lorica' },
  { oldId: 'dianas_bestiarius_ocrea', newId: 'dianas_chase_ocrea' },
  { oldId: 'dianas_bestiarius_caligae', newId: 'dianas_chase_caligae' },
  { oldId: 'dianas_bestiarius_manica', newId: 'dianas_chase_manica' },
  { oldId: 'apprentice_retiarius_galea', newId: 'custos_aegis_galea' },
  { oldId: 'apprentice_retiarius_lorica', newId: 'custos_aegis_lorica' },
  { oldId: 'apprentice_retiarius_ocrea', newId: 'custos_aegis_ocrea' },
  { oldId: 'apprentice_retiarius_caligae', newId: 'custos_aegis_caligae' },
  { oldId: 'apprentice_retiarius_manica', newId: 'custos_aegis_manica' },
  { oldId: 'veteran_retiarius_galea', newId: 'horatius_stand_galea' },
  { oldId: 'veteran_retiarius_lorica', newId: 'horatius_stand_lorica' },
  { oldId: 'veteran_retiarius_ocrea', newId: 'horatius_stand_ocrea' },
  { oldId: 'veteran_retiarius_caligae', newId: 'horatius_stand_caligae' },
  { oldId: 'veteran_retiarius_manica', newId: 'horatius_stand_manica' },
  { oldId: 'champions_retiarius_galea', newId: 'cassandras_ward_galea' },
  { oldId: 'champions_retiarius_lorica', newId: 'cassandras_ward_lorica' },
  { oldId: 'champions_retiarius_ocrea', newId: 'cassandras_ward_ocrea' },
  { oldId: 'champions_retiarius_caligae', newId: 'cassandras_ward_caligae' },
  { oldId: 'champions_retiarius_manica', newId: 'cassandras_ward_manica' },
  { oldId: 'grandmaster_retiarius_galea', newId: 'aeneas_shelter_galea' },
  { oldId: 'grandmaster_retiarius_lorica', newId: 'aeneas_shelter_lorica' },
  { oldId: 'grandmaster_retiarius_ocrea', newId: 'aeneas_shelter_ocrea' },
  { oldId: 'grandmaster_retiarius_caligae', newId: 'aeneas_shelter_caligae' },
  { oldId: 'grandmaster_retiarius_manica', newId: 'aeneas_shelter_manica' },
  { oldId: 'nemesiss_retiarius_galea', newId: 'nemesis_grace_galea' },
  { oldId: 'nemesiss_retiarius_lorica', newId: 'nemesis_grace_lorica' },
  { oldId: 'nemesiss_retiarius_ocrea', newId: 'nemesis_grace_ocrea' },
  { oldId: 'nemesiss_retiarius_caligae', newId: 'nemesis_grace_caligae' },
  { oldId: 'nemesiss_retiarius_manica', newId: 'nemesis_grace_manica' },
  ];

  const stmtRenameInstances = db.prepare('UPDATE item_instances SET item_id = ? WHERE item_id = ?');
  const stmtRenameInventory = db.prepare('UPDATE inventory SET item_id = ? WHERE item_id = ?');

  const renameOldIds = db.transaction(() => {
    for (const { oldId, newId } of OLD_TO_NEW_ITEM_ID) {
      stmtRenameInstances.run(newId, oldId);
      stmtRenameInventory.run(newId, oldId);
    }
  });
  renameOldIds();
}

{
  const equippedInstanceRows = db.prepare('SELECT DISTINCT item_id, instance_id FROM item_instances').all();
  const orphanedInstanceIds = equippedInstanceRows.filter((r) => !getItem(r.item_id)).map((r) => r.instance_id);

  const stackedItemIds = db.prepare('SELECT DISTINCT item_id FROM inventory').all().map((r) => r.item_id);
  const orphanedStackIds = stackedItemIds.filter((id) => !getItem(id));

  if (orphanedInstanceIds.length > 0 || orphanedStackIds.length > 0) {
    console.log(
      `Pruning ${orphanedInstanceIds.length} equipment instance(s) and ${orphanedStackIds.length} collectable type(s) no longer in the item catalog...`
    );

    const pruneOrphans = db.transaction(() => {
      const slotColumns = ['helmet', 'chest', 'legs', 'boots', 'gloves', 'main_hand', 'off_hand'];
      if (orphanedInstanceIds.length > 0) {
        const placeholders = orphanedInstanceIds.map(() => '?').join(',');
        for (const col of slotColumns) {
          db.prepare(`UPDATE equipment SET ${col} = NULL WHERE ${col} IN (${placeholders})`).run(...orphanedInstanceIds);
          db.prepare(`UPDATE loadouts SET ${col} = NULL WHERE ${col} IN (${placeholders})`).run(...orphanedInstanceIds);
        }
        db.prepare(`DELETE FROM item_instances WHERE instance_id IN (${placeholders})`).run(...orphanedInstanceIds);
      }
      if (orphanedStackIds.length > 0) {
        const placeholders = orphanedStackIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM inventory WHERE item_id IN (${placeholders})`).run(...orphanedStackIds);
      }
    });
    pruneOrphans();
  }
}

{
  const starterItemIds = getStarterKitItems().map((item) => item.id);
  if (starterItemIds.length > 0) {
    const placeholders = starterItemIds.map(() => '?').join(',');
    db.prepare(`UPDATE item_instances SET durability = 100 WHERE item_id IN (${placeholders}) AND durability < 100`).run(...starterItemIds);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS gain_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL, -- 'cash' | 'arena' | 'item'
    item_id    TEXT,          -- only set when kind = 'item'
    amount     INTEGER NOT NULL,
    source     TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gain_log_user_time ON gain_log(guild_id, user_id, created_at);
`);
