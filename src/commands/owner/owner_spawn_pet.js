import { SlashCommandBuilder } from 'discord.js';
import { isOwnerId } from '../../utils/owner.js';
import { isMainServer } from '../../utils/botConfig.js';
import { createTestPet, describePet, clearPetCollectionLogEntries, removeAllPetsForUser } from '../../utils/pets.js';
import { PET_SPECIES } from '../../data/pets.js';
import { EconomyError } from '../../utils/economy.js';
import { normalizeQuotes } from '../../utils/textMatch.js';

export default {
  data: new SlashCommandBuilder()
    .setName('owner_spawn_pet')
    .setDescription('Testing only — spawn a pet with max base stats for its rarity')
    .addStringOption((opt) => opt.setName('species').setDescription('Which species (required unless using a cleanup option below)').setRequired(false).setAutocomplete(true))
    .addUserOption((opt) => opt.setName('user').setDescription('Who gets it / who to clean up (defaults to you)').setRequired(false))
    .addBooleanOption((opt) =>
      opt.setName('clear_collection_log').setDescription('Instead of spawning, wipe this user\'s pet Collection Log entries clean').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('remove_all_pets').setDescription('Instead of spawning, delete every pet this user owns (does NOT touch their Collection Log)').setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName('shiny').setDescription('Force this spawn to be shiny, bypassing the normal roll (only works for species with shiny art)').setRequired(false)
    ),

  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    const matches = PET_SPECIES.filter((s) => normalizeQuotes(s.name.toLowerCase()).includes(typed)).slice(0, 25);
    await interaction.respond(matches.map((s) => ({ name: `${s.name} (${s.rarity}${s.source === 'boss' ? ', Godly' : ''})`, value: s.id })));
  },

  async execute(interaction) {
    if (!isOwnerId(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this.', ephemeral: true });
    }
    if (!isMainServer(interaction.guildId)) {
      return interaction.reply({ content: 'Owner tools only work in the main server.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') ?? interaction.user;

    if (interaction.options.getBoolean('clear_collection_log')) {
      const cleared = clearPetCollectionLogEntries(target.id);
      return interaction.reply({
        content: `🧹 Cleared **${cleared}** pet Collection Log entr${cleared === 1 ? 'y' : 'ies'} for <@${target.id}>.`,
        ephemeral: true,
      });
    }

    if (interaction.options.getBoolean('remove_all_pets')) {
      const removed = removeAllPetsForUser(interaction.guildId, target.id);
      return interaction.reply({
        content: `🗑️ Removed **${removed}** pet${removed === 1 ? '' : 's'} owned by <@${target.id}>. Their Collection Log is untouched — use \`clear_collection_log\` separately if you want that wiped too.`,
        ephemeral: true,
      });
    }

    const speciesId = interaction.options.getString('species');
    if (!speciesId) {
      return interaction.reply({ content: 'Pick a `species:` to spawn, or use one of the cleanup options instead.', ephemeral: true });
    }
    const forceShiny = interaction.options.getBoolean('shiny') ?? false;

    try {
      const pet = createTestPet(interaction.guildId, target.id, speciesId, forceShiny);
      const described = describePet(pet);
      const shinyNote = described.isShiny ? ` ✨ **SHINY** (ability roll: ${pet.shiny_ability_percent}%)` : forceShiny ? ' *(shiny requested, but this species has no shiny art yet)*' : '';
      return interaction.reply({
        content: `🧪 Spawned a max-roll **${described.speciesName}**${shinyNote} for <@${target.id}> — ATK ${pet.attack} · DEF ${pet.defense} · VIT ${pet.vitality} · SPD ${pet.speed}.`,
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
