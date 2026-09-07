import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../../database.js';
import { ITEMS, isCollectable } from '../../data/items.js';
import { isSellable, getSellValue } from '../../utils/sell.js';
import { addItemToInventory, getOwnedQuantity, getUnequippedInstances, lockInstance, unlockInstance } from '../../utils/inventory.js';
import { getPetsForUser, describePet, PET_SELL_PRICE } from '../../utils/pets.js';
import { formatMoney, formatArena } from '../../utils/format.js';
import { ensureGuild, EconomyError } from '../../utils/economy.js';
import { recordPendingSell, getPendingSell, clearPendingSell } from '../../utils/pendingSells.js';
import { meetsTradeLevelRequirement } from '../../utils/gladiator.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { startSession, endSession, getActiveLabel } from '../../utils/activeSession.js';

const SELL_CONFIRM_TIMEOUT_MS = 15_000; 

const SELLABLE_ITEMS = ITEMS.filter(isSellable);

export const SELL_CONFIRM_PREFIX = 'sell-confirm';
export const SELL_CANCEL_PREFIX = 'sell-cancel';

export const PET_SELL_CONFIRM_PREFIX = 'pet-sell-confirm';
export const PET_SELL_CANCEL_PREFIX = 'pet-sell-cancel';

function parseSellEntries(text) {
  return text
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const match = piece.match(/^(\d+)\s+(.+)$/);
      if (match) return { quantity: parseInt(match[1], 10), rawName: match[2].trim() };
      return { quantity: 1, rawName: piece };
    });
}

function resolveSellableItem(rawName) {
  const typed = normalizeQuotes(rawName.toLowerCase());
  const exact = SELLABLE_ITEMS.find((item) => normalizeQuotes(item.name.toLowerCase()) === typed);
  if (exact) return { item: exact, error: null };

  const partial = SELLABLE_ITEMS.filter((item) => normalizeQuotes(item.name.toLowerCase()).includes(typed));
  if (partial.length === 1) return { item: partial[0], error: null };
  if (partial.length === 0) return { item: null, error: `couldn't find a sellable item matching "${rawName}"` };
  return { item: null, error: `"${rawName}" matches multiple items (${partial.map((i) => i.name).join(', ')}) — be more specific` };
}

function buildConfirmRow(sellKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${SELL_CONFIRM_PREFIX}:${sellKey}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${SELL_CANCEL_PREFIX}:${sellKey}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell items from your inventory')
    .addStringOption((opt) =>
      opt.setName('items').setDescription('e.g. "1 sword, 3 elixir" — comma-separated, quantity optional').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('pet').setDescription('Sell one specific pet instead — flat price, no bulk selling').setRequired(false).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'pet') return interaction.respond([]);
    const typed = normalizeQuotes(focused.value.toLowerCase());
    
    
    const pets = getPetsForUser(interaction.guildId, interaction.user.id).map((p, i) => ({ ...describePet(p), displayIndex: i + 1 }));
    const matches = pets
      .filter((p) => !p.untradeable)
      .filter((p) => normalizeQuotes(p.displayName.toLowerCase()).includes(typed) || normalizeQuotes(p.speciesName.toLowerCase()).includes(typed))
      .slice(0, 25);
    await interaction.respond(matches.map((p) => ({ name: `${p.isShiny ? '✨ ' : ''}${p.displayName} (id:${p.displayIndex})`, value: p.instance_id })));
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const petInstanceId = interaction.options.getString('pet');
    const text = interaction.options.getString('items');

    if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
      return interaction.reply({ content: 'the store owner doesnt trust you yet go get some experience', ephemeral: true });
    }

    const activeLabel = getActiveLabel(guildId, userId);
    if (activeLabel) {
      return interaction.reply({ content: `You already have **${activeLabel}** in progress — finish it (or let it time out) before selling.`, ephemeral: true });
    }

    
    
    
    
    if (petInstanceId) {
      const pet = getPetsForUser(guildId, userId).find((p) => p.instance_id === petInstanceId);
      if (!pet) {
        return interaction.reply({ content: "You don't own that pet.", ephemeral: true });
      }
      const described = describePet(pet);
      if (described.untradeable) {
        return interaction.reply({ content: `**${described.displayName}** can't be sold.`, ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PET_SELL_CONFIRM_PREFIX}:${petInstanceId}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${PET_SELL_CANCEL_PREFIX}:${petInstanceId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
      );
      startSession(guildId, userId, 'a Sell confirmation');
      await interaction.reply({
        content: `You're really about to sell **${described.displayName}** the ${described.speciesName} for **${PET_SELL_PRICE}** arena coins? That's it?`,
        components: [row],
      });
      setTimeout(async () => {
        
        
        
        
        
        
        
        if (getActiveLabel(guildId, userId) !== 'a Sell confirmation') return;
        endSession(guildId, userId);
        await interaction.editReply({ content: 'Sale timed out — nothing was sold.', components: [] }).catch(() => {});
      }, SELL_CONFIRM_TIMEOUT_MS);
      return;
    }

    if (!text) {
      return interaction.reply({ content: 'Give me something to sell — either `items:` or `pet:`.', ephemeral: true });
    }

    const entries = parseSellEntries(text);
    if (entries.length === 0) {
      return interaction.reply({ content: "Didn't catch anything to sell — try something like `1 sword, 3 elixir`.", ephemeral: true });
    }

    const resolved = [];
    const errors = [];
    for (const entry of entries) {
      const { item, error } = resolveSellableItem(entry.rawName);
      if (error) {
        errors.push(error);
        continue;
      }
      const owned = getOwnedQuantity(guildId, userId, item.id);
      if (owned < entry.quantity) {
        errors.push(`You don't own ${entry.quantity}x ${item.name} You only own ${owned}`);
        continue;
      }
      resolved.push({ item, quantity: entry.quantity });
    }

    if (errors.length > 0) {
      return interaction.reply({ content: `Couldn't sell anything:\n${errors.map((e) => `- ${e}`).join('\n')}`, ephemeral: true });
    }

    const settings = ensureGuild(guildId);
    let totalArena = 0;
    let totalCash = 0;
    const escrowedItems = [];
    const soldLabels = [];

    const escrowAll = db.transaction(() => {
      for (const { item, quantity } of resolved) {
        if (isCollectable(item)) {
          addItemToInventory(guildId, userId, item.id, -quantity);
          const value = getSellValue(item);
          totalArena += value.arena * quantity;
          totalCash += value.cash * quantity;
          escrowedItems.push({ kind: 'collectable', itemId: item.id, name: item.name, quantity });
        } else {

          const available = getUnequippedInstances(guildId, userId, item.id).sort((a, b) => a.durability - b.durability);
          if (available.length < quantity) {
            throw new EconomyError(`Can't sell ${quantity}x ${item.name} — only ${available.length} owned (unequipped).`);
          }
          const chosen = available.slice(0, quantity);
          for (const instance of chosen) {
            lockInstance(instance.instanceId);
            const value = getSellValue(item, instance.durability);
            totalArena += value.arena;
            totalCash += value.cash;
            escrowedItems.push({ kind: 'equipment', itemId: item.id, name: item.name, instanceId: instance.instanceId, durability: instance.durability });
          }
        }
        soldLabels.push(`${quantity}x ${item.name}`);
      }
    });

    try {
      escrowAll();
    } catch (err) {
      if (err instanceof EconomyError) return interaction.reply({ content: err.message, ephemeral: true });
      throw err;
    }

    const sellKey = recordPendingSell(guildId, userId, escrowedItems, totalArena, totalCash);
    const totalLine = `${formatArena(totalArena)}${totalCash > 0 ? ` + ${formatMoney(totalCash, settings)}` : ''}`;

    startSession(guildId, userId, 'a Sell confirmation');
    await interaction.reply({
      content: `You're going to sell ${soldLabels.join(', ')} for ${totalLine}.`,
      components: [buildConfirmRow(sellKey)],
    });
    setTimeout(async () => {
      
      
      
      const stillPending = getPendingSell(sellKey);
      if (!stillPending || getActiveLabel(guildId, userId) !== 'a Sell confirmation') return;
      for (const entry of stillPending.items) {
        if (entry.kind === 'equipment') {
          unlockInstance(entry.instanceId);
        } else {
          addItemToInventory(stillPending.guild_id, stillPending.user_id, entry.itemId, entry.quantity);
        }
      }
      clearPendingSell(sellKey);
      endSession(guildId, userId);
      await interaction.editReply({ content: 'Sale timed out — everything has been refunded.', components: [] }).catch(() => {});
    }, SELL_CONFIRM_TIMEOUT_MS);
  },
};
