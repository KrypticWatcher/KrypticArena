import { SlashCommandBuilder } from 'discord.js';
import { getPetsForUser, getActivePet, describePet, setActivePet, renamePet, applyCandyToPet } from '../../utils/pets.js';
import { getOwnedQuantity, addItemToInventory } from '../../utils/inventory.js';
import { getStatFocusCandy, STAT_FOCUS_CANDIES } from '../../data/pets.js';
import { EconomyError } from '../../utils/economy.js';
import { normalizeQuotes } from '../../utils/textMatch.js';
import { blockIfEquipBusy } from '../../utils/equipShared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your Beast Pits pets')
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Set your active pet')
        .addStringOption((opt) => opt.setName('pet').setDescription('Which pet to equip').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Give your currently equipped pet a nickname')
        .addStringOption((opt) => opt.setName('name').setDescription('New nickname (1-32 characters)').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('feed')
        .setDescription('Feed a stat-focus candy to a pet — steers its next 2-3 level-ups')
        .addStringOption((opt) => opt.setName('pet').setDescription('Which pet to feed').setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName('candy').setDescription('Which candy to use').setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const typed = normalizeQuotes(focused.value.toLowerCase());

    if (focused.name === 'candy') {
      
      
      const owned = STAT_FOCUS_CANDIES.map((c) => ({ ...c, quantity: getOwnedQuantity(interaction.guildId, interaction.user.id, c.id) }))
        .filter((c) => c.quantity > 0 && normalizeQuotes(c.name.toLowerCase()).includes(typed))
        .slice(0, 25);
      return interaction.respond(owned.map((c) => ({ name: `${c.name} (x${c.quantity})`, value: c.id })));
    }

    
    
    const pets = getPetsForUser(interaction.guildId, interaction.user.id).map((p, i) => ({ ...describePet(p), displayIndex: i + 1 }));
    const matches = pets
      .filter((p) => normalizeQuotes(p.displayName.toLowerCase()).includes(typed) || normalizeQuotes(p.speciesName.toLowerCase()).includes(typed))
      .slice(0, 25);
    await interaction.respond(matches.map((p) => ({ name: `${p.isShiny ? '✨ ' : ''}${p.displayName} (id:${p.displayIndex})`, value: p.instance_id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === 'feed') {
      const instanceId = interaction.options.getString('pet', true);
      const candyId = interaction.options.getString('candy', true);
      const candy = getStatFocusCandy(candyId);
      if (!candy) {
        return interaction.reply({ content: "That's not a real candy.", ephemeral: true });
      }
      const petRaw = getPetsForUser(guildId, userId).find((p) => p.instance_id === instanceId);
      if (!petRaw) {
        return interaction.reply({ content: "You don't own that pet.", ephemeral: true });
      }
      const owned = getOwnedQuantity(guildId, userId, candyId);
      if (owned < 1) {
        return interaction.reply({ content: `You don't have any **${candy.name}** — check your \`/inventory\`.`, ephemeral: true });
      }

      const hadActiveCandy = Boolean(petRaw.stat_focus_id) && petRaw.stat_focus_levels_remaining > 0;
      addItemToInventory(guildId, userId, candyId, -1);
      const { levelsWindow } = applyCandyToPet(instanceId, candyId);

      const pet = describePet(getPetsForUser(guildId, userId).find((p) => p.instance_id === instanceId));
      const overwriteNote = hadActiveCandy ? ' (replacing its previous candy effect)' : '';
      return interaction.reply({
        content: `🍬 **${pet.displayName}** eats the **${candy.name}**${overwriteNote}. Its next **${levelsWindow}** level-ups will lean toward ${candy.stats.join('/')}.`,
      });
    }

    if (sub === 'equip') {
      const instanceId = interaction.options.getString('pet', true);
      
      
      
      const busyMessage = blockIfEquipBusy(guildId, userId, interaction.user.displayName);
      if (busyMessage) return interaction.reply({ content: busyMessage, ephemeral: true });
      try {
        setActivePet(guildId, userId, instanceId);
        const pet = describePet(getPetsForUser(guildId, userId).find((p) => p.instance_id === instanceId));
        return interaction.reply({ content: `🐾 **${pet.displayName}** the ${pet.speciesName} is now your active pet.` });
      } catch (err) {
        if (err instanceof EconomyError) {
          return interaction.reply({ content: err.message, ephemeral: true });
        }
        throw err;
      }
    }

    
    const activePet = getActivePet(guildId, userId);
    if (!activePet) {
      return interaction.reply({ content: "You don't have a pet equipped — use `/pet equip` first.", ephemeral: true });
    }
    const newName = interaction.options.getString('name', true);
    try {
      const pet = renamePet(guildId, userId, activePet.instance_id, newName);
      const described = describePet(pet);
      return interaction.reply({ content: `🐾 Your **${described.speciesName}** is now named **${described.displayName}**.` });
    } catch (err) {
      if (err instanceof EconomyError) {
        return interaction.reply({ content: err.message, ephemeral: true });
      }
      throw err;
    }
  },
};
