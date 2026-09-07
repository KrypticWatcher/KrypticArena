import { SlashCommandBuilder } from 'discord.js';
import { isOwnerId } from '../../utils/owner.js';
import { isMainServer } from '../../utils/botConfig.js';
import { addItemToInventory } from '../../utils/inventory.js';
import { getItem, ITEMS } from '../../data/items.js';
import { PET_SPECIES, getPetSpecies } from '../../data/pets.js';
import { createGiftedPet, describePet } from '../../utils/pets.js';
import { EconomyError } from '../../utils/economy.js';
import { normalizeQuotes } from '../../utils/textMatch.js';

const MAX_QUANTITY = 1000;

function buildAutocompleteChoices(typed) {
  const itemMatches = ITEMS.filter((item) => normalizeQuotes(item.name.toLowerCase()).includes(typed) || item.id.includes(typed)).map((item) => ({
    name: `${item.name} (${item.type === 'equipment' ? 'Equipment' : 'Collectible'}${item.tier ? `, Tier ${item.tier}` : ''})`,
    value: item.id,
  }));
  const petMatches = PET_SPECIES.filter((s) => normalizeQuotes(s.name.toLowerCase()).includes(typed) || s.id.includes(typed)).map((s) => ({
    name: `${s.name} (Pet, ${s.rarity}${s.source === 'boss' ? ', Godly' : s.source === 'unique' ? ', 1-of-1' : ''})`,
    value: s.id,
  }));
  return [...itemMatches, ...petMatches].slice(0, 25);
}

export default {
  data: new SlashCommandBuilder()
    .setName('owner_grant_item')
    .setDescription('Owner only — gift a user any equipment, collectible, weapon, or pet by id')
    .addUserOption((opt) => opt.setName('user').setDescription('Who receives it').setRequired(true))
    .addStringOption((opt) => opt.setName('item').setDescription('Item or pet species to grant').setRequired(true).setAutocomplete(true))
    .addIntegerOption((opt) =>
      opt.setName('quantity').setDescription('How many (items only — pets always grant exactly 1)').setRequired(false).setMinValue(1).setMaxValue(MAX_QUANTITY)
    ),

  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    await interaction.respond(buildAutocompleteChoices(typed));
  },

  async execute(interaction) {
    if (!isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    }
    if (!isMainServer(interaction.guildId)) {
      return interaction.reply({ content: 'Owner tools only work in the main server.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const id = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity') ?? 1;

    const species = getPetSpecies(id);
    if (species) {
      try {
        const pet = createGiftedPet(interaction.guildId, target.id, id);
        const described = describePet(pet);
        const uniqueNote = species.source === 'unique' ? ' *(1-of-1 — not added to the Collection Log)*' : '';
        return interaction.reply({
          content: `🎁 Gifted **${described.speciesName}** (${described.displayName}) to <@${target.id}>${uniqueNote} — ATK ${pet.attack} · DEF ${pet.defense} · VIT ${pet.vitality} · SPD ${pet.speed}.`,
          ephemeral: true,
        });
      } catch (err) {
        if (err instanceof EconomyError) {
          return interaction.reply({ content: err.message, ephemeral: true });
        }
        throw err;
      }
    }

    const item = getItem(id);
    if (!item) {
      return interaction.reply({ content: `No item or pet species with id \`${id}\` exists.`, ephemeral: true });
    }
    try {
      addItemToInventory(interaction.guildId, target.id, id, quantity, null);
      return interaction.reply({
        content: `🎁 Gifted **${quantity}x ${item.name}** to <@${target.id}>.`,
        ephemeral: true,
      });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
