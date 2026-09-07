import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

let paginationIdCounter = 0;

export async function replyPaginated(interaction, { buildPagePayload, totalPages, timeoutMs = 5 * 60 * 1000 }) {
  const uid = `pg${Date.now()}${paginationIdCounter++}`;
  let page = 0;

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const buildNavRow = () => {
    if (totalPages <= 1) return [];
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${uid}-first`).setEmoji('⏮').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${uid}-prev`).setEmoji('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${uid}-page`).setLabel(`${page + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${uid}-next`).setEmoji('▶').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1),
        new ButtonBuilder().setCustomId(`${uid}-last`).setEmoji('⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
      ),
    ];
  };

  const buildFullPayload = async () => {
    const payload = await buildPagePayload(page);
    return { ...payload, components: [...(payload.components ?? []), ...buildNavRow()] };
  };

  
  
  
  
  
  
  
  
  
  
  
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  await interaction.editReply(await buildFullPayload());
  if (totalPages <= 1) return;

  const message = await interaction.fetchReply();
  const ownerId = interaction.user.id;
  const collector = message.createMessageComponentCollector({
    filter: (i) =>
      i.customId === `${uid}-first` || i.customId === `${uid}-prev` || i.customId === `${uid}-next` || i.customId === `${uid}-last`,
    time: timeoutMs,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== ownerId) {
      return i.reply({ content: "This isn't your command to control.", ephemeral: true });
    }
    if (i.customId === `${uid}-first`) page = 0;
    else if (i.customId === `${uid}-prev`) page = Math.max(0, page - 1);
    else if (i.customId === `${uid}-next`) page = Math.min(totalPages - 1, page + 1);
    else if (i.customId === `${uid}-last`) page = totalPages - 1;
    await i.update(await buildFullPayload());
  });

  collector.on('end', async () => {
    try {
      await message.edit({ components: [] });
    } catch {
      
    }
  });
}
