import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import type { NormalizedChatMessage } from '@simsand/shared';

import { log } from '../logger.js';
import { parseTwitchPrivmsg } from './parse-irc.js';

export interface TwitchIrcAdapterOptions {
  channel: string;
  nick: string;
  token: string;
  onMessage: (message: NormalizedChatMessage) => void | Promise<void>;
}

// Reads chat and turns PRIVMSG lines into normalized messages. It does not
// parse commands or touch the simulation.
export class TwitchIrcAdapter {
  private socket: WebSocket | undefined;

  private stopped = false;

  constructor(private readonly options: TwitchIrcAdapterOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = undefined;
  }

  private connect(): void {
    const channel = this.options.channel.replace(/^#/, '').toLowerCase();
    const token = this.options.token.replace(/^oauth:/i, '');
    const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.socket = socket;

    socket.on('open', () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      socket.send(`PASS oauth:${token}`);
      socket.send(`NICK ${this.options.nick}`);
      socket.send(`JOIN #${channel}`);
      log.info(`Twitch IRC connected as ${this.options.nick} in #${channel}`);
    });

    socket.on('message', (data) => {
      const lines = String(data).split('\r\n').filter((line) => line.length > 0);

      for (const line of lines) {
        void this.handleLine(line);
      }
    });

    socket.on('close', () => {
      this.socket = undefined;

      if (!this.stopped) {
        log.warn('Twitch IRC disconnected; reconnecting in 5 seconds');
        setTimeout(() => this.connect(), 5_000);
      }
    });

    socket.on('error', (error) => {
      log.error('Twitch IRC error:', error);
    });
  }

  private async handleLine(line: string): Promise<void> {
    if (line.startsWith('PING ')) {
      this.socket?.send(`PONG ${line.slice(5)}`);
      return;
    }

    if (line.includes(' RECONNECT')) {
      this.socket?.close();
      return;
    }

    const message = parseTwitchPrivmsg(line);

    if (!message) return;

    try {
      await this.options.onMessage(message);
    } catch (error) {
      log.error('Failed to handle Twitch chat message:', error);
    }
  }
}

export function newViewerId(): string {
  return `viewer-${randomUUID().replace(/-/g, '')}`;
}