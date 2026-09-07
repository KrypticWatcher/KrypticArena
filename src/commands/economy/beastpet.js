import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { getPetsForUser, getActivePet, describePet, getPetLevelProgress } from '../../utils/pets.js';
import { renderPetCard } from '../../utils/petImage.js';
import { normalizeQuotes } from '../../utils/textMatch.js';

export default {
  data: new SlashCommandBuilder()
    .setName('beastpet')
    .setDescription("View one of your pets' stat card")
    .addStringOption((opt) => opt.setName('pet').setDescription('Which pet (defaults to your equipped one)').setRequired(false).setAutocomplete(true)),

  async autocomplete(interaction) {
    const typed = normalizeQuotes(interaction.options.getFocused().toLowerCase());
    
    
    
    
    
    
    
    
    
    const pets = getPetsForUser(interaction.guildId, interaction.user.id).map((p, i) => ({ ...describePet(p), displayIndex: i + 1 }));
    const matches = pets
      .filter((p) => normalizeQuotes(p.displayName.toLowerCase()).includes(typed) || normalizeQuotes(p.speciesName.toLowerCase()).includes(typed))
      .slice(0, 25);
    await interaction.respond(matches.map((p) => ({ name: `${p.isShiny ? '✨ ' : ''}${p.displayName} (id:${p.displayIndex})`, value: p.instance_id })));
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const requestedId = interaction.options.getString('pet');

    const rawPet = requestedId
      ? getPetsForUser(guildId, userId).find((p) => p.instance_id === requestedId)
      : getActivePet(guildId, userId);

    if (!rawPet) {
      return interaction.reply({
        content: requestedId
          ? "Couldn't find that pet — it may have been traded, sold, or you never owned it."
          : "You don't have a pet equipped — pick one with `/pet equip`, or specify one directly here.",
        ephemeral: true,
      });
    }

    const pet = describePet(rawPet);
    const progress = getPetLevelProgress(pet.xp);

    const buffer = await renderPetCard(pet, progress);
    const attachment = new AttachmentBuilder(buffer, { name: 'petcard.png' });

    return interaction.reply({ files: [attachment] });
  },
};
