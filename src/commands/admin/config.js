import {
  SlashCommandBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from '../../utils/permissions.js';
import { isMainServer } from '../../utils/botConfig.js';
import {
  parseButtonCustomId,
  parseSelectCustomId,
  parseModalCustomId,
  buildValueModal,
  modalCustomId,
} from '../../utils/panel.js';
import {
  buildConfigTopPanel,
  buildEconomyPanel,
  buildCurrencyPanel,
  buildStartingBalancePanel,
  buildCasinoConfigPanel,
  buildBlackjackPanel,
  buildRoulettePanel,
  buildSlotsPanel,
  buildDicePanel,
  buildArenaConfigPanel,
  buildSlavePanel,
  buildClaimsPanel,
  buildExchangePanel,
  buildAdventurePanel,
  buildChampionPanel,
} from '../../utils/configPanelScreens.js';
import { ensureGuild, updateGuildSettings, EconomyError } from '../../utils/economy.js';
import { parseAmount } from '../../utils/parseAmount.js';
import { logAdminAction, ADMIN_ACTIONS } from '../../utils/auditLog.js';
import { CHAMPION_BRACKETS, getBracketMaxWager, getBracketXpModifier, getBracketBaseXp } from '../../utils/championBrackets.js';

function renderScreen(guildId, adminUserId, screen) {
  switch (screen) {
    case 'config-top':
      return buildConfigTopPanel(adminUserId);
    case 'config-economy':
      return buildEconomyPanel(guildId, adminUserId);
    case 'config-economy-currency':
      return buildCurrencyPanel(guildId, adminUserId);
    case 'config-economy-balance':
      return buildStartingBalancePanel(guildId, adminUserId);
    case 'config-casino':
      return buildCasinoConfigPanel(adminUserId);
    case 'config-casino-blackjack':
      return buildBlackjackPanel(guildId, adminUserId);
    case 'config-casino-roulette':
      return buildRoulettePanel(guildId, adminUserId);
    case 'config-casino-slots':
      return buildSlotsPanel(guildId, adminUserId);
    case 'config-casino-dice':
      return buildDicePanel(guildId, adminUserId);
    case 'config-arena':
      return buildArenaConfigPanel(adminUserId);
    case 'config-arena-slave':
      return buildSlavePanel(guildId, adminUserId);
    case 'config-arena-claims':
      return buildClaimsPanel(guildId, adminUserId);
    case 'config-arena-exchange':
      return buildExchangePanel(guildId, adminUserId);
    case 'config-arena-adventure':
      return buildAdventurePanel(guildId, adminUserId);
    case 'config-arena-champion':
      return buildChampionPanel(guildId, adminUserId);
    default:
      return buildConfigTopPanel(adminUserId);
  }
}

const NAV_ACTIONS = new Set(['', 'back', 'refresh']);

function buildRangeModal({ adminUserId, screen, action, title, minLabel, maxLabel, minValue, maxValue }) {
  const minInput = new TextInputBuilder()
    .setCustomId('min')
    .setLabel(minLabel)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (minValue !== undefined) minInput.setValue(String(minValue));
  const maxInput = new TextInputBuilder()
    .setCustomId('max')
    .setLabel(maxLabel)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (maxValue !== undefined) maxInput.setValue(String(maxValue));

  return new ModalBuilder()
    .setCustomId(modalCustomId(adminUserId, screen, action))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(minInput),
      new ActionRowBuilder().addComponents(maxInput)
    );
}

function parseWholeNumber(raw) {
  if (!/^\d+$/.test(raw.trim())) return null;
  return parseInt(raw.trim(), 10);
}

async function requireAdminInMainServer(interaction) {
  if (!(await requireAdmin(interaction))) return false;
  if (!isMainServer(interaction.guildId)) {
    await interaction.reply({ content: '/config only works in the main server.', ephemeral: true });
    return false;
  }
  return true;
}

export default {
  data: new SlashCommandBuilder().setName('config').setDescription("Configure this server's settings (admin only)"),

  async execute(interaction) {
    if (!(await requireAdminInMainServer(interaction))) return;
    const { embeds, components } = buildConfigTopPanel(interaction.user.id);
    return interaction.reply({ embeds, components, ephemeral: true });
  },

  
  async handleButton(interaction) {
    const parsed = parseButtonCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdminInMainServer(interaction))) return true;

    const { targetUserId: adminUserId, screen, action } = parsed;
    const guildId = interaction.guildId;

    if (screen === 'config-close') {
      await interaction.update({ content: '✅ Panel closed.', embeds: [], components: [] });
      return true;
    }

    
    if (NAV_ACTIONS.has(action)) {
      await interaction.update(renderScreen(guildId, adminUserId, screen));
      return true;
    }

    
    if (screen === 'config-economy-currency') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: action === 'name' ? 'Change Currency Name' : 'Change Currency Symbol',
        label: action === 'name' ? 'New currency name' : 'New currency symbol',
        value: action === 'name' ? settings.currency_name : settings.currency_symbol,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-economy-balance') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: action === 'cash' ? 'Set Starting Cash' : 'Set Starting Bank',
        label: 'New amount',
        placeholder: 'e.g. 500, 1.5k, 2m',
        value: action === 'cash' ? settings.starting_cash : settings.starting_bank,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-casino-blackjack' && ['decks', 'cooldown'].includes(action)) {
      const settings = ensureGuild(guildId);
      const fieldMeta = {
        decks: { title: 'Blackjack Deck Count', label: 'Number of decks (1-8)', value: settings.deck_count },
        cooldown: { title: 'Blackjack Cooldown', label: 'Seconds between hands (0 disables it)', value: settings.blackjack_cooldown_seconds },
      }[action];
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: fieldMeta.title,
        label: fieldMeta.label,
        value: fieldMeta.value,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-casino-roulette' && ['window', 'maxlength', 'minbet', 'cooldown'].includes(action)) {
      const settings = ensureGuild(guildId);
      const fieldMeta = {
        window: { title: 'Roulette Betting Window', label: 'Seconds to extend on each new bet', value: settings.roulette_bet_window_seconds },
        maxlength: { title: 'Roulette Max Round Length', label: 'Hard cap in seconds from the first bet', value: settings.roulette_max_round_seconds },
        minbet: { title: 'Roulette Minimum Bet', label: 'Smallest amount accepted per bet', value: settings.roulette_min_bet },
        cooldown: { title: 'Roulette Cooldown', label: 'Seconds between bets (0 disables it)', value: settings.roulette_cooldown_seconds },
      }[action];
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: fieldMeta.title,
        label: fieldMeta.label,
        value: fieldMeta.value,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-casino-slots' && ['minbet', 'payout', 'cooldown'].includes(action)) {
      const settings = ensureGuild(guildId);
      const fieldMeta = {
        minbet: { title: 'Slots Minimum Bet', label: 'Smallest amount accepted per bet', value: settings.slots_min_bet },
        payout: { title: 'Slots Payout Multiplier', label: 'Percent (100=normal, 90=stingier, 110=looser)', value: settings.slots_payout_multiplier_pct },
        cooldown: { title: 'Slots Cooldown', label: 'Seconds between spins (0 disables it)', value: settings.slots_cooldown_seconds },
      }[action];
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: fieldMeta.title,
        label: fieldMeta.label,
        value: fieldMeta.value,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-casino-dice' && ['minbet', 'payout', 'cooldown'].includes(action)) {
      const settings = ensureGuild(guildId);
      const fieldMeta = {
        minbet: { title: 'Dice Minimum Bet', label: 'Smallest amount accepted per bet', value: settings.dice_min_bet },
        payout: { title: 'Dice Payout Multiplier', label: 'Percent (100=normal, 90=stingier, 110=looser)', value: settings.dice_payout_multiplier_pct },
        cooldown: { title: 'Dice Cooldown', label: 'Seconds between rolls (0 disables it)', value: settings.dice_cooldown_seconds },
      }[action];
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: fieldMeta.title,
        label: fieldMeta.label,
        value: fieldMeta.value,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-arena-slave') {
      const settings = ensureGuild(guildId);
      if (action === 'cooldown') {
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: 'Slave Cooldown',
          label: 'Cooldown in minutes',
          placeholder: '1-10080',
          value: Math.round(settings.slave_cooldown_seconds / 60),
        });
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'cap') {
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: 'Slave Daily Arena Coin Cap',
          label: 'Max arena coins per rolling 24h',
          value: settings.slave_arena_daily_cap,
        });
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'cash') {
        const modal = buildRangeModal({
          adminUserId,
          screen,
          action,
          title: 'Slave Cash Reward Range',
          minLabel: 'Minimum cash reward',
          maxLabel: 'Maximum cash reward',
          minValue: settings.slave_gambling_min,
          maxValue: settings.slave_gambling_max,
        });
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'arena') {
        const modal = buildRangeModal({
          adminUserId,
          screen,
          action,
          title: 'Slave Arena Coin Reward Range',
          minLabel: 'Minimum arena coin reward',
          maxLabel: 'Maximum arena coin reward',
          minValue: settings.slave_arena_min,
          maxValue: settings.slave_arena_max,
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    if (screen === 'config-arena-claims' && action === 'cooldown-arena') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: 'Claim Cooldown — Arena',
        label: 'Cooldown in minutes',
        placeholder: '1-10080',
        value: Math.round(settings.claim_cooldown_arena_seconds / 60),
      });
      await interaction.showModal(modal);
      return true;
    }
    if (screen === 'config-arena-claims' && action === 'cooldown-gambling') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: 'Claim Cooldown — Gambling',
        label: 'Cooldown in minutes',
        placeholder: '1-10080',
        value: Math.round(settings.claim_cooldown_gambling_seconds / 60),
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-arena-exchange') {
      const settings = ensureGuild(guildId);
      if (action === 'cooldown') {
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: 'Exchange Cooldown',
          label: 'Cooldown in seconds (0 disables it)',
          placeholder: '0-86400',
          value: settings.exchange_cooldown_seconds,
        });
        await interaction.showModal(modal);
        return true;
      }
      if (action === 'cap') {
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: 'Exchange Daily Arena Coin Limit',
          label: 'Max arena coins per rolling 24h',
          value: settings.exchange_daily_cap,
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    if (screen === 'config-casino-blackjack' && action === 'sidebets') {
      const settings = ensureGuild(guildId);
      const next = settings.blackjack_side_bets_enabled ? 0 : 1;
      updateGuildSettings(guildId, { blackjack_side_bets_enabled: next });
      logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Blackjack side bets: ${next ? 'enabled' : 'disabled'}`);
      await interaction.update(buildBlackjackPanel(guildId, adminUserId));
      return true;
    }

    
    if (screen === 'config-arena-adventure' && action === 'duration') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: 'Adventure Base Trip Time',
        label: 'Minutes (0-45)',
        placeholder: '0-45',
        value: settings.adventure_base_minutes,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    if (screen === 'config-arena-champion' && action === 'wager') {
      const settings = ensureGuild(guildId);
      const modal = buildValueModal({
        targetUserId: adminUserId,
        screen,
        action,
        title: 'Champion Minimum Wager',
        label: 'Minimum wager, in arena coins',
        value: settings.champion_min_wager,
      });
      await interaction.showModal(modal);
      return true;
    }

    
    
    
    
    {
      const bracketMatch = screen === 'config-arena-champion' ? /^wager_b([1-6])$/.exec(action) : null;
      if (bracketMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(bracketMatch[1]));
        const settings = ensureGuild(guildId);
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: `${bracket.name} Max Wager`,
          label: 'Max wager, in arena coins',
          value: getBracketMaxWager(settings, bracket),
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    
    
    {
      const bracketMatch = screen === 'config-arena-champion' ? /^xp_b([1-6])$/.exec(action) : null;
      if (bracketMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(bracketMatch[1]));
        const settings = ensureGuild(guildId);
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: `${bracket.name} Bonus XP`,
          label: 'Bonus Gladiator XP on a win, as a %',
          value: getBracketXpModifier(settings, bracket),
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    
    
    
    {
      const bracketMatch = screen === 'config-arena-champion' ? /^basexp_b([1-6])$/.exec(action) : null;
      if (bracketMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(bracketMatch[1]));
        const settings = ensureGuild(guildId);
        const modal = buildValueModal({
          targetUserId: adminUserId,
          screen,
          action,
          title: `${bracket.name} Base XP`,
          label: 'Gladiator XP a WIN in this bracket is worth',
          value: getBracketBaseXp(settings, bracket),
        });
        await interaction.showModal(modal);
        return true;
      }
    }

    
    await interaction.update(buildConfigTopPanel(adminUserId));
    return true;
  },

  
  
  
  
  
  async handleSelect(interaction) {
    const parsed = parseSelectCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdminInMainServer(interaction))) return true;
    await interaction.update(buildConfigTopPanel(parsed.targetUserId));
    return true;
  },

  
  async handleModal(interaction) {
    const parsed = parseModalCustomId(interaction.customId);
    if (!parsed) return false;
    if (!(await requireAdminInMainServer(interaction))) return true;

    const { targetUserId: adminUserId, screen, action } = parsed;
    const guildId = interaction.guildId;

    try {
      
      if (screen === 'config-economy-currency') {
        const raw = interaction.fields.getTextInputValue('value').trim();
        if (!raw || raw.length > (action === 'name' ? 32 : 8)) {
          return interaction.reply({
            content: `That's too long — ${action === 'name' ? 'currency names' : 'symbols'} must be 1-${action === 'name' ? 32 : 8} characters.`,
            ephemeral: true,
          });
        }
        const key = action === 'name' ? 'currency_name' : 'currency_symbol';
        updateGuildSettings(guildId, { [key]: raw });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Currency ${action}: "${raw}"`);
        await interaction.update(buildCurrencyPanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-economy-balance') {
        const raw = interaction.fields.getTextInputValue('value');
        const amount = parseAmount(raw);
        if (amount === null || amount < 0) {
          return interaction.reply({
            content: `**${raw}** isn't a valid amount. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`.`,
            ephemeral: true,
          });
        }
        const key = action === 'cash' ? 'starting_cash' : 'starting_bank';
        updateGuildSettings(guildId, { [key]: amount });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Starting ${action}: ${amount.toLocaleString('en-US')}`);
        await interaction.update(buildStartingBalancePanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-casino-blackjack' && ['decks', 'cooldown'].includes(action)) {
        const raw = interaction.fields.getTextInputValue('value');
        const parsed = parseWholeNumber(raw);
        if (action === 'decks' && (parsed === null || parsed < 1 || parsed > 8)) {
          return interaction.reply({ content: `**${raw}** isn't valid — deck count must be a whole number, 1-8.`, ephemeral: true });
        }
        if (action === 'cooldown' && (parsed === null || parsed < 0)) {
          return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of seconds, 0 or more.`, ephemeral: true });
        }
        const columnByAction = { decks: 'deck_count', cooldown: 'blackjack_cooldown_seconds' };
        const labelByAction = { decks: 'Deck count', cooldown: 'Cooldown' };
        updateGuildSettings(guildId, { [columnByAction[action]]: parsed });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Blackjack ${labelByAction[action]}: ${parsed}`);
        await interaction.update(buildBlackjackPanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-casino-roulette' && ['window', 'maxlength', 'minbet', 'cooldown'].includes(action)) {
        const raw = interaction.fields.getTextInputValue('value');
        const parsed = parseWholeNumber(raw);
        const minAllowed = action === 'cooldown' ? 0 : 1;
        if (parsed === null || parsed < minAllowed) {
          return interaction.reply({ content: `**${raw}** isn't valid — must be a whole number of at least ${minAllowed}.`, ephemeral: true });
        }
        const columnByAction = {
          window: 'roulette_bet_window_seconds',
          maxlength: 'roulette_max_round_seconds',
          minbet: 'roulette_min_bet',
          cooldown: 'roulette_cooldown_seconds',
        };
        const labelByAction = { window: 'Betting window', maxlength: 'Max round length', minbet: 'Minimum bet', cooldown: 'Cooldown' };
        updateGuildSettings(guildId, { [columnByAction[action]]: parsed });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Roulette ${labelByAction[action]}: ${parsed}`);
        await interaction.update(buildRoulettePanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-casino-slots' && ['minbet', 'payout', 'cooldown'].includes(action)) {
        const raw = interaction.fields.getTextInputValue('value');
        const parsed = parseWholeNumber(raw);
        if (action === 'minbet' && (parsed === null || parsed < 1)) {
          return interaction.reply({ content: `**${raw}** isn't valid — minimum bet must be a whole number of at least 1.`, ephemeral: true });
        }
        if (action === 'payout' && (parsed === null || parsed < 1 || parsed > 500)) {
          return interaction.reply({ content: `**${raw}** isn't valid — payout multiplier must be a whole percent, 1-500.`, ephemeral: true });
        }
        if (action === 'cooldown' && (parsed === null || parsed < 0)) {
          return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of seconds, 0 or more.`, ephemeral: true });
        }
        const columnByAction = { minbet: 'slots_min_bet', payout: 'slots_payout_multiplier_pct', cooldown: 'slots_cooldown_seconds' };
        const labelByAction = { minbet: 'Minimum bet', payout: 'Payout multiplier', cooldown: 'Cooldown' };
        updateGuildSettings(guildId, { [columnByAction[action]]: parsed });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Slots ${labelByAction[action]}: ${parsed}${action === 'payout' ? '%' : ''}`);
        await interaction.update(buildSlotsPanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-casino-dice' && ['minbet', 'payout', 'cooldown'].includes(action)) {
        const raw = interaction.fields.getTextInputValue('value');
        const parsed = parseWholeNumber(raw);
        if (action === 'minbet' && (parsed === null || parsed < 1)) {
          return interaction.reply({ content: `**${raw}** isn't valid — minimum bet must be a whole number of at least 1.`, ephemeral: true });
        }
        if (action === 'payout' && (parsed === null || parsed < 1 || parsed > 500)) {
          return interaction.reply({ content: `**${raw}** isn't valid — payout multiplier must be a whole percent, 1-500.`, ephemeral: true });
        }
        if (action === 'cooldown' && (parsed === null || parsed < 0)) {
          return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of seconds, 0 or more.`, ephemeral: true });
        }
        const columnByAction = { minbet: 'dice_min_bet', payout: 'dice_payout_multiplier_pct', cooldown: 'dice_cooldown_seconds' };
        const labelByAction = { minbet: 'Minimum bet', payout: 'Payout multiplier', cooldown: 'Cooldown' };
        updateGuildSettings(guildId, { [columnByAction[action]]: parsed });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Dice ${labelByAction[action]}: ${parsed}${action === 'payout' ? '%' : ''}`);
        await interaction.update(buildDicePanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-arena-slave') {
        if (action === 'cooldown') {
          const raw = interaction.fields.getTextInputValue('value');
          const minutes = parseWholeNumber(raw);
          if (minutes === null || minutes < 1 || minutes > 10080) {
            return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of minutes, 1-10080.`, ephemeral: true });
          }
          updateGuildSettings(guildId, { slave_cooldown_seconds: minutes * 60 });
          logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Slave cooldown: ${minutes}m`);
          await interaction.update(buildSlavePanel(guildId, adminUserId));
          return true;
        }

        if (action === 'cap') {
          const raw = interaction.fields.getTextInputValue('value');
          const cap = parseWholeNumber(raw);
          if (cap === null || cap < 0) {
            return interaction.reply({ content: `**${raw}** isn't valid — the daily cap must be a non-negative whole number.`, ephemeral: true });
          }
          updateGuildSettings(guildId, { slave_arena_daily_cap: cap });
          logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Slave arena daily cap: ${cap}`);
          await interaction.update(buildSlavePanel(guildId, adminUserId));
          return true;
        }

        if (action === 'cash' || action === 'arena') {
          const rawMin = interaction.fields.getTextInputValue('min');
          const rawMax = interaction.fields.getTextInputValue('max');
          const min = parseWholeNumber(rawMin);
          const max = parseWholeNumber(rawMax);
          if (min === null || max === null || min < 0 || max < 0) {
            return interaction.reply({ content: 'Both values must be non-negative whole numbers.', ephemeral: true });
          }
          if (min > max) {
            return interaction.reply({ content: `Minimum (${min}) can't be greater than maximum (${max}).`, ephemeral: true });
          }
          const keys = action === 'cash' ? ['slave_gambling_min', 'slave_gambling_max'] : ['slave_arena_min', 'slave_arena_max'];
          updateGuildSettings(guildId, { [keys[0]]: min, [keys[1]]: max });
          logAdminAction(
            guildId,
            interaction.user.id,
            ADMIN_ACTIONS.SETTINGS_CHANGE,
            null,
            `Slave ${action} reward range: ${min}-${max}`
          );
          await interaction.update(buildSlavePanel(guildId, adminUserId));
          return true;
        }
      }

      
      if (screen === 'config-arena-claims' && (action === 'cooldown-arena' || action === 'cooldown-gambling')) {
        const raw = interaction.fields.getTextInputValue('value');
        const minutes = parseWholeNumber(raw);
        if (minutes === null || minutes < 1 || minutes > 10080) {
          return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of minutes, 1-10080.`, ephemeral: true });
        }
        const settingKey = action === 'cooldown-arena' ? 'claim_cooldown_arena_seconds' : 'claim_cooldown_gambling_seconds';
        const label = action === 'cooldown-arena' ? 'Arena' : 'Gambling';
        updateGuildSettings(guildId, { [settingKey]: minutes * 60 });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Claim cooldown (${label}): ${minutes}m`);
        await interaction.update(buildClaimsPanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-arena-exchange') {
        if (action === 'cooldown') {
          const raw = interaction.fields.getTextInputValue('value');
          const seconds = parseWholeNumber(raw);
          if (seconds === null || seconds < 0 || seconds > 86400) {
            return interaction.reply({ content: `**${raw}** isn't valid — cooldown must be a whole number of seconds, 0-86400.`, ephemeral: true });
          }
          updateGuildSettings(guildId, { exchange_cooldown_seconds: seconds });
          logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Exchange cooldown: ${seconds}s`);
          await interaction.update(buildExchangePanel(guildId, adminUserId));
          return true;
        }
        if (action === 'cap') {
          const raw = interaction.fields.getTextInputValue('value');
          const cap = parseWholeNumber(raw);
          if (cap === null || cap < 0) {
            return interaction.reply({ content: `**${raw}** isn't valid — the daily cap must be a non-negative whole number.`, ephemeral: true });
          }
          updateGuildSettings(guildId, { exchange_daily_cap: cap });
          logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Exchange daily cap: ${cap}`);
          await interaction.update(buildExchangePanel(guildId, adminUserId));
          return true;
        }
      }

      
      if (screen === 'config-arena-adventure' && action === 'duration') {
        const raw = interaction.fields.getTextInputValue('value');
        const minutes = parseWholeNumber(raw);
        if (minutes === null || minutes < 0 || minutes > 45) {
          return interaction.reply({ content: `**${raw}** isn't valid — base trip time must be a whole number of minutes, 0-45.`, ephemeral: true });
        }
        updateGuildSettings(guildId, { adventure_base_minutes: minutes });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Adventure base trip time: ${minutes}m`);
        await interaction.update(buildAdventurePanel(guildId, adminUserId));
        return true;
      }

      
      if (screen === 'config-arena-champion' && action === 'wager') {
        const raw = interaction.fields.getTextInputValue('value');
        const amount = parseAmount(raw);
        if (amount === null || amount < 0) {
          return interaction.reply({
            content: `**${raw}** isn't a valid amount. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`.`,
            ephemeral: true,
          });
        }
        updateGuildSettings(guildId, { champion_min_wager: amount });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `Champion minimum wager: ${amount.toLocaleString('en-US')}`);
        await interaction.update(buildChampionPanel(guildId, adminUserId));
        return true;
      }

      
      const bracketSubmitMatch = screen === 'config-arena-champion' ? /^wager_b([1-6])$/.exec(action) : null;
      if (bracketSubmitMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(bracketSubmitMatch[1]));
        const raw = interaction.fields.getTextInputValue('value');
        const amount = parseAmount(raw);
        if (amount === null || amount < 0) {
          return interaction.reply({
            content: `**${raw}** isn't a valid amount. Try a plain number or shorthand like \`500\`, \`1.5k\`, \`2m\`.`,
            ephemeral: true,
          });
        }
        updateGuildSettings(guildId, { [`champion_bracket_${bracket.order}_max_wager`]: amount });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `${bracket.name} max wager: ${amount.toLocaleString('en-US')}`);
        await interaction.update(buildChampionPanel(guildId, adminUserId));
        return true;
      }

      
      const xpSubmitMatch = screen === 'config-arena-champion' ? /^xp_b([1-6])$/.exec(action) : null;
      if (xpSubmitMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(xpSubmitMatch[1]));
        const raw = interaction.fields.getTextInputValue('value');
        const amount = Number(raw);
        if (!Number.isInteger(amount) || amount < 0) {
          return interaction.reply({
            content: `**${raw}** isn't a valid amount — enter a whole number percent, e.g. \`10\` for +10%.`,
            ephemeral: true,
          });
        }
        updateGuildSettings(guildId, { [`champion_bracket_${bracket.order}_xp_bonus`]: amount });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `${bracket.name} bonus XP: +${amount}%`);
        await interaction.update(buildChampionPanel(guildId, adminUserId));
        return true;
      }

      const baseXpSubmitMatch = screen === 'config-arena-champion' ? /^basexp_b([1-6])$/.exec(action) : null;
      if (baseXpSubmitMatch) {
        const bracket = CHAMPION_BRACKETS.find((b) => b.order === Number(baseXpSubmitMatch[1]));
        const raw = interaction.fields.getTextInputValue('value');
        const amount = Number(raw);
        if (!Number.isInteger(amount) || amount < 0) {
          return interaction.reply({
            content: `**${raw}** isn't a valid amount — enter a whole number, e.g. \`250\`.`,
            ephemeral: true,
          });
        }
        updateGuildSettings(guildId, { [`champion_bracket_${bracket.order}_base_xp`]: amount });
        logAdminAction(guildId, interaction.user.id, ADMIN_ACTIONS.SETTINGS_CHANGE, null, `${bracket.name} base XP: ${amount}`);
        await interaction.update(buildChampionPanel(guildId, adminUserId));
        return true;
      }
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    await interaction.update(buildConfigTopPanel(adminUserId));
    return true;
  },
};
