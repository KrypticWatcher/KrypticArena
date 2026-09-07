import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { getPetsForUser, describePet } from '../../utils/pets.js';
import { renderPetGridImage, PETS_PER_PAGE } from '../../utils/petGridImage.js';
import { replyPaginated } from '../../utils/pagination.js';
import { getGladiatorRow } from '../../utils/gladiator.js';
import { resolveInventoryBackgroundPath } from '../../utils/inventoryBackgrounds.js';

export default {
  data: new SlashCommandBuilder().setName('beastpets').setDescription('View every pet you own'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const pets = getPetsForUser(guildId, userId).map(describePet);
    const displayName = interaction.user.displayName ?? interaction.user.username;

    
    
    
    const bgRow = getGladiatorRow(guildId, userId);
    const customBackgroundPath = bgRow?.beastpets_bg_id ? resolveInventoryBackgroundPath(bgRow.beastpets_bg_id) : null;

    if (pets.length === 0) {
      const buffer = await renderPetGridImage(displayName, [], { page: 1, totalPages: 1, customBackgroundPath });
      return interaction.reply({ files: [new AttachmentBuilder(buffer, { name: 'pets.png' })] });
    }

    const totalPages = Math.max(1, Math.ceil(pets.length / PETS_PER_PAGE));
    return replyPaginated(interaction, {
      totalPages,
      buildPagePayload: async (page) => {
        const pagePets = pets.slice(page * PETS_PER_PAGE, (page + 1) * PETS_PER_PAGE);
        const buffer = await renderPetGridImage(displayName, pagePets, { page: page + 1, totalPages, customBackgroundPath });
        return { files: [new AttachmentBuilder(buffer, { name: 'pets.png' })] };
      },
    });
  },
};
