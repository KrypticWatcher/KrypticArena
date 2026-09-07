import fs from 'node:fs';
import { hasFlag, grantFlag, revokeFlag } from './permissions.js';
import { ensureGuild, updateGuildSettings } from './economy.js';
import { getRoleIconPath } from './tierBadgeAssets.js';

const TIER_ROLE_DEFS = {
  T1: { name: 'Arena Initiate🛡️', color: 0x8a8a8a },
  T2: { name: 'Arena Contender🗡️', color: 0x9a9a9a },
  T3: { name: 'Proven Gladiator⚔️', color: 0xaaaaaa },
  T4: { name: 'Elite Gladiator👑', color: 0xd4af37 },
  T5: { name: 'Arena Champion🦁', color: 0xc9a6ff },
  T6: { name: 'Arena Legend🐦‍🔥', color: 0xf2704e },
  T7: { name: 'Arena Immortal💀', color: 0x1a1a1a },
};

function iconAttachmentFor(tierFlag) {
  const iconPath = getRoleIconPath(tierFlag);
  if (!iconPath || !fs.existsSync(iconPath)) return undefined;
  return fs.readFileSync(iconPath);
}

async function syncRoleIcon(role, tierFlag) {
  const icon = iconAttachmentFor(tierFlag);
  if (!icon) return;
  if (role.icon) return; 
  await role.setIcon(icon, `Custom badge art for ${tierFlag} (see utils/tierRoles.js)`).catch(() => {});
}

async function getOrCreateTierRole(guild, tierFlag) {
  const def = TIER_ROLE_DEFS[tierFlag];
  const settings = ensureGuild(guild.id);
  const tierNum = tierFlag.replace('T', '');
  const storedId = settings[`tier${tierNum}_role_id`];

  if (storedId) {
    const existing = guild.roles.cache.get(storedId) ?? (await guild.roles.fetch(storedId).catch(() => null));
    if (existing) {
      await syncRoleIcon(existing, tierFlag);
      return existing;
    }

  }

  const created = await guild.roles.create({
    name: def.name,
    color: def.color,
    hoist: true,
    mentionable: false,
    icon: iconAttachmentFor(tierFlag),
    reason: `Auto-created for the ${tierFlag} bitfield perk (see utils/tierRoles.js)`,
  }).catch(async (err) => {

    
    if (!iconAttachmentFor(tierFlag)) throw err;
    return guild.roles.create({
      name: def.name,
      color: def.color,
      hoist: true,
      mentionable: false,
      reason: `Auto-created for the ${tierFlag} bitfield perk (see utils/tierRoles.js)`,
    });
  });
  updateGuildSettings(guild.id, { [`tier${tierNum}_role_id`]: created.id });
  return created;
}

export async function syncTierRole(client, userId, tierFlag) {
  const guildId = process.env.TIER_ROLES_GUILD_ID;
  if (!guildId) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const role = await getOrCreateTierRole(guild, tierFlag).catch(() => null);
  if (!role) return;

  const shouldHaveRole = hasFlag(userId, tierFlag);
  const hasRole = member.roles.cache.has(role.id);

  if (shouldHaveRole && !hasRole) {
    await member.roles.add(role, `${tierFlag} bitfield flag granted`).catch(() => {});
  } else if (!shouldHaveRole && hasRole) {
    await member.roles.remove(role, `${tierFlag} bitfield flag revoked`).catch(() => {});
  }
}

export async function syncAllTierRoles(client, userId) {
  for (const tierFlag of Object.keys(TIER_ROLE_DEFS)) {
    await syncTierRole(client, userId, tierFlag);
  }
}

export async function syncAllTierRolesForMany(client, userIds) {
  for (const userId of userIds) {
    await syncAllTierRoles(client, userId);
  }
}

export function syncTierFlagsFromRoles(guildId, member) {
  const settings = ensureGuild(guildId);
  for (const tierFlag of Object.keys(TIER_ROLE_DEFS)) {
    const tierNum = tierFlag.replace('T', '');
    const storedId = settings[`tier${tierNum}_role_id`];
    if (!storedId) continue; 

    const hasRole = member.roles.cache.has(storedId);
    const hasTheFlag = hasFlag(member.id, tierFlag);

    if (hasRole && !hasTheFlag) {
      grantFlag(member.id, tierFlag);
    } else if (!hasRole && hasTheFlag) {
      revokeFlag(member.id, tierFlag);
    }
  }
}
