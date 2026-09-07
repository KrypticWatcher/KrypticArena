import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStorePetSpecies, getPetSpecies, PET_PRICE_BY_RARITY } from '../../data/pets.js';
import { createPet, getPetPurchaseAllowance, consumePetPurchaseAllowance } from '../../utils/pets.js';
import { EconomyError, getArenaBalance, addArenaCoins } from '../../utils/economy.js';
import { formatArena } from '../../utils/format.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { meetsTradeLevelRequirement } from '../../utils/gladiator.js';

export default {
  data: new SlashCommandBuilder()
    .setName('beaststore')
    .setDescription('Buy a pet for the Beast Pits')
    .addSubcommand((sub) => sub.setName('view').setDescription("See what's for sale"))
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy one pet')
        .addStringOption((opt) => opt.setName('species').setDescription('Which pet to buy').setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    const matches = getStorePetSpecies()
      .filter((s) => normalizeQuotes(s.name.toLowerCase()).includes(typed))
      .slice(0, 25);
    await interaction.respond(
      matches.map((s) => ({
        name: `${s.name} (${s.rarity}) — ${formatArena(PET_PRICE_BY_RARITY[s.rarity])}`,
        value: s.id,
      }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    
    
    
    
    if (!meetsTradeLevelRequirement(guildId, userId, interaction.user.displayName)) {
      return interaction.reply({
        content: "The pet black market dealer doesn't deal with weak gladiators. Go train.",
        ephemeral: true,
      });
    }

    if (sub === 'view') {
      const species = getStorePetSpecies();
      const { remaining, windowResetsAt } = getPetPurchaseAllowance(guildId, userId);
      const lines = species.map((s) => `**${s.name}** (${s.rarity}) — ${formatArena(PET_PRICE_BY_RARITY[s.rarity])}${s.description ? `\n*${s.description}*` : ''}`);
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle('🐾 Beastpets Shop')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `You can buy ${remaining} more pet(s) this window — resets ${new Date(windowResetsAt).toLocaleString()}` });
      return interaction.reply({ embeds: [embed] });
    }

    
    const speciesId = interaction.options.getString('species', true);
    const species = getPetSpecies(speciesId);
    if (!species || species.source !== 'store') {
      return interaction.reply({ content: "That's not a pet the store sells.", ephemeral: true });
    }

    const price = PET_PRICE_BY_RARITY[species.rarity];
    const balance = getArenaBalance(guildId, userId);
    if (balance < price) {
      return interaction.reply({
        content: `You need **${formatArena(price)}** for a ${species.name} — you have **${formatArena(balance)}**.`,
        ephemeral: true,
      });
    }

    try {
      consumePetPurchaseAllowance(guildId, userId);
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }

    addArenaCoins(guildId, userId, -price);
    const pet = createPet(guildId, userId, speciesId);
    return interaction.reply({
      content:
        `🐾 Bought a **${species.name}** for **${formatArena(price)}**! You've named it **${pet.given_name}**.\n` +
        `ATK ${pet.attack} · DEF ${pet.defense} · VIT ${pet.vitality} · SPD ${pet.speed}\n` +
        `Arena balance: **${formatArena(getArenaBalance(guildId, userId))}**.`,
    });
  },
};
