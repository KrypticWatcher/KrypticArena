export function isOwnerId(userId) {
  const owners = (process.env.OWNER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return owners.includes(userId);
}
