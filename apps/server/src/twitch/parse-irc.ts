import type { NormalizedChatMessage } from '@simsand/shared';

// Twitch IRC PRIVMSG with optional IRCv3 tags. Tags carry the stable user id.
export function parseTwitchPrivmsg(line: string, receivedAt = Date.now()): NormalizedChatMessage | undefined {
  const tagsEnd = line.indexOf(' :');

  if (tagsEnd <= 0 || !line.startsWith('@')) {
    return parseUntaggedPrivmsg(line, receivedAt);
  }

  const tags = line.slice(1, tagsEnd);
  const rest = line.slice(tagsEnd + 2);
  const match = /^([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/u.exec(rest);

  if (!match) return undefined;

  const platformUserId = tagValue(tags, 'user-id');

  if (!platformUserId) return undefined;

  const platformUsername = tagValue(tags, 'login') ?? match[1];
  const displayName = tagValue(tags, 'display-name') ?? platformUsername;
  const messageId = tagValue(tags, 'id') ?? `${platformUserId}-${receivedAt}`;

  return {
    platform: 'twitch',
    platformUserId,
    platformUsername,
    displayName,
    messageId,
    text: match[2],
    receivedAt,
  };
}

function parseUntaggedPrivmsg(line: string, receivedAt: number): NormalizedChatMessage | undefined {
  const match = /^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/u.exec(line);

  if (!match) return undefined;

  const platformUsername = match[1];

  return {
    platform: 'twitch',
    platformUserId: platformUsername,
    platformUsername,
    displayName: platformUsername,
    messageId: `${platformUsername}-${receivedAt}`,
    text: match[2],
    receivedAt,
  };
}

function tagValue(tags: string, key: string): string | undefined {
  const prefix = `${key}=`;
  const part = tags.split(';').find((entry) => entry.startsWith(prefix));

  if (!part) return undefined;

  return decodeIrcTag(part.slice(prefix.length));
}

function decodeIrcTag(value: string): string {
  return value
    .replaceAll('\\s', ' ')
    .replaceAll('\\:', ';')
    .replaceAll('\\\\', '\\')
    .replaceAll('\\r', '\r')
    .replaceAll('\\n', '\n');
}