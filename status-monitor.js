import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const botName = process.env.STATUS_BOT_NAME?.trim() || 'Casino Bot';
const offlineAfterSeconds = Number(process.env.STATUS_OFFLINE_AFTER_SECONDS || 90);
const checkEverySeconds = Number(process.env.STATUS_CHECK_EVERY_SECONDS || 15);

const heartbeatPath = path.join(process.cwd(), 'data', 'bot-heartbeat.json');

const webhookUrlPattern = /^https:\/\/(discord(?:app)?\.com|canary\.discord\.com|ptb\.discord\.com)\/api\/webhooks\//i;

function collectWebhookUrls() {
  const urls = [];

  const single = process.env.STATUS_WEBHOOK_URL?.trim();
  if (single) urls.push({ id: 'default', url: single });

  let index = 1;
  while (true) {
    const value = process.env[`STATUS_WEBHOOK_URL_${index}`]?.trim();
    if (!value) break;
    urls.push({ id: String(index), url: value });
    index += 1;
  }

  return urls;
}

const webhookConfigs = collectWebhookUrls();

if (webhookConfigs.length === 0) {
  console.error('No webhook URLs found. Set STATUS_WEBHOOK_URL or STATUS_WEBHOOK_URL_1, STATUS_WEBHOOK_URL_2, etc. in your .env file.');
  process.exit(1);
}

for (const { id, url } of webhookConfigs) {
  if (!webhookUrlPattern.test(url)) {
    console.error(`STATUS_WEBHOOK_URL_${id} does not look like a Discord webhook URL.`);
    process.exit(1);
  }
}

function readHeartbeat() {
  try {
    const heartbeat = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
    const updatedAt = Number(heartbeat.updatedAt);
    const ageSeconds = (Date.now() - updatedAt) / 1000;
    const online = heartbeat.state === 'online' && Number.isFinite(updatedAt) && ageSeconds <= offlineAfterSeconds;
    return { ...heartbeat, updatedAt, ageSeconds, online };
  } catch {
    return { online: false, updatedAt: null, ageSeconds: null, ping: null, guildCount: null };
  }
}

function buildPayload(heartbeat) {
  const lastUnix = heartbeat.updatedAt ? Math.floor(heartbeat.updatedAt / 1000) : null;
  const statusText = heartbeat.online ? 'Online' : 'Offline';

  const fields = [
    {
      name: 'Status',
      value: heartbeat.online ? '🟢 Online' : '🔴 Offline',
      inline: false,
    },
    {
      name: 'Last heartbeat',
      value: lastUnix ? `<t:${lastUnix}:R>` : 'None received yet',
      inline: false,
    },
  ];

  if (heartbeat.online && Number.isFinite(heartbeat.ping)) {
    fields.push({ name: 'Discord ping', value: `${Math.round(heartbeat.ping)} ms`, inline: false });
  }

  if (heartbeat.online && Number.isFinite(heartbeat.guildCount)) {
    fields.push({ name: 'Servers', value: String(heartbeat.guildCount), inline: false });
  }

  return {
    username: `${botName} Status `,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${heartbeat.online ? '🟢' : '🔴'} ${botName} — ${statusText}`,
        description: heartbeat.online
          ? 'The gates are open, and gladiators clash within the arena.'
          : `The gates are closed, and the arena has fallen silent for more than ${offlineAfterSeconds} seconds.`,
        color: heartbeat.online ? 0x57F287 : 0xED4245,
        fields,
        footer: { text: 'This message is automatically updated.' },
        timestamp: new Date().toISOString(),
      },
    ],
    content: '',
  };
}

async function discordRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Discord returned ${response.status}: ${body}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function createMonitor({ id, url }) {
  const messageIdPath = path.join(process.cwd(), 'data', `status-monitor-message-id-${id}.txt`);

  function loadMessageId() {
    try {
      return fs.readFileSync(messageIdPath, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  function saveMessageId(messageId) {
    fs.mkdirSync(path.dirname(messageIdPath), { recursive: true });
    fs.writeFileSync(messageIdPath, messageId, 'utf8');
  }

  async function createMessage(payload) {
    const separator = url.includes('?') ? '&' : '?';
    const message = await discordRequest(`${url}${separator}wait=true`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    saveMessageId(message.id);
    console.log(`[webhook ${id}] Created status message ${message.id}.`);
    return message.id;
  }

  async function editMessage(messageId, payload) {
    await discordRequest(`${url}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  let messageId = loadMessageId();
  let previousOnline = null;
  let lastRefresh = 0;
  let runningCheck = false;

  async function checkStatus(heartbeat) {
    if (runningCheck) return;
    runningCheck = true;

    try {
      const shouldRefresh = heartbeat.online !== previousOnline || Date.now() - lastRefresh >= 60_000;
      if (!shouldRefresh) return;

      const payload = buildPayload(heartbeat);

      if (!messageId) {
        messageId = await createMessage(payload);
      } else {
        try {
          await editMessage(messageId, payload);
        } catch (error) {
          if (error.status === 404) {
            messageId = await createMessage(payload);
          } else {
            throw error;
          }
        }
      }

      previousOnline = heartbeat.online;
      lastRefresh = Date.now();
      console.log(`[webhook ${id}] [${new Date().toLocaleString()}] ${botName}: ${heartbeat.online ? 'ONLINE' : 'OFFLINE'}`);
    } catch (error) {
      console.error(`[webhook ${id}] Status monitor check failed:`, error.message);
    } finally {
      runningCheck = false;
    }
  }

  return { checkStatus };
}

const monitors = webhookConfigs.map(createMonitor);

async function checkAll() {
  const heartbeat = readHeartbeat();
  await Promise.all(monitors.map((monitor) => monitor.checkStatus(heartbeat)));
}

console.log(`Watching ${heartbeatPath}`);
console.log(`The bot will be marked offline after ${offlineAfterSeconds} seconds without a heartbeat.`);
console.log(`Posting status to ${monitors.length} webhook${monitors.length === 1 ? '' : 's'}.`);
await checkAll();
setInterval(checkAll, checkEverySeconds * 1000);
