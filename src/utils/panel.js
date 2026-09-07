import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const PANEL_COLOR = 0x5865f2; 
export const PANEL_DANGER_COLOR = 0xe74c3c;

export const PANEL_BUTTON_PREFIX = 'panelbtn';
export const PANEL_SELECT_PREFIX = 'panelsel';
export const PANEL_MODAL_PREFIX = 'panelmodal';

function buildCustomId(prefix, targetUserId, screen, action) {
  return [prefix, targetUserId, screen, action ?? ''].join(':');
}

function parseCustomId(prefix, customId) {
  const parts = customId.split(':');
  if (parts[0] !== prefix) return null;
  const targetUserId = parts[1];
  const screen = parts[2];

  const action = parts.slice(3).join(':');

  
  
  
  return { targetUserId, screen, action: action || '' };
}

export function buttonCustomId(targetUserId, screen, action) {
  return buildCustomId(PANEL_BUTTON_PREFIX, targetUserId, screen, action);
}
export function parseButtonCustomId(customId) {
  return parseCustomId(PANEL_BUTTON_PREFIX, customId);
}

export function selectCustomId(targetUserId, screen, action) {
  return buildCustomId(PANEL_SELECT_PREFIX, targetUserId, screen, action);
}
export function parseSelectCustomId(customId) {
  return parseCustomId(PANEL_SELECT_PREFIX, customId);
}

export function modalCustomId(targetUserId, screen, action) {
  return buildCustomId(PANEL_MODAL_PREFIX, targetUserId, screen, action);
}
export function parseModalCustomId(customId) {
  return parseCustomId(PANEL_MODAL_PREFIX, customId);
}

export function buildPanelEmbed({ title, description, fields, color = PANEL_COLOR, footer }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

export function buildButtonRows(spec) {
  const rows = [];
  for (let i = 0; i < spec.length; i += 5) {
    const chunk = spec.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((b) => {
          const button = new ButtonBuilder().setLabel(b.label).setDisabled(Boolean(b.disabled));
          if (b.url) {
            return button.setStyle(ButtonStyle.Link).setURL(b.url);
          }
          return button.setCustomId(buttonCustomId(b.targetUserId, b.screen, b.action)).setStyle(b.style ?? ButtonStyle.Secondary);
        })
      )
    );
  }
  return rows;
}

export function backButton(targetUserId, screen) {
  return { targetUserId, screen, action: 'back', label: '◀️ Back', style: ButtonStyle.Secondary };
}

export function buildSelectRow({ targetUserId, screen, action, placeholder, options, minValues = 1, maxValues = 1 }) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId(targetUserId, screen, action))
    .setPlaceholder(placeholder)
    .setMinValues(minValues)
    .setMaxValues(maxValues)
    .addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

export function buildUserSelectRow({ targetUserId, screen, action, placeholder }) {
  const menu = new UserSelectMenuBuilder().setCustomId(selectCustomId(targetUserId, screen, action)).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1);
  return new ActionRowBuilder().addComponents(menu);
}

export function buildRoleSelectRow({ targetUserId, screen, action, placeholder }) {
  const menu = new RoleSelectMenuBuilder().setCustomId(selectCustomId(targetUserId, screen, action)).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1);
  return new ActionRowBuilder().addComponents(menu);
}

export function buildConfirmationPanel({ targetUserId, screen, confirmAction, cancelAction, title, description }) {
  const embed = buildPanelEmbed({ title: `⚠️ ${title}`, description, color: PANEL_DANGER_COLOR });
  const rows = buildButtonRows([
    { targetUserId, screen, action: confirmAction, label: '✅ Confirm', style: ButtonStyle.Danger },
    { targetUserId, screen, action: cancelAction, label: '❌ Cancel', style: ButtonStyle.Secondary },
  ]);
  return { embeds: [embed], components: rows };
}

export function buildValueModal({ targetUserId, screen, action, title, label, placeholder, value, required = true }) {
  const input = new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setRequired(required);
  if (placeholder) input.setPlaceholder(placeholder);
  if (value !== undefined && value !== null) input.setValue(String(value));
  return new ModalBuilder()
    .setCustomId(modalCustomId(targetUserId, screen, action))
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}
