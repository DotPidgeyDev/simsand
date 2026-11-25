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
// parse commands or touch the simulation. Replies are plain channel chat.
export class TwitchIrcAdapter {
  private socket: WebSocket | undefined;

  private stopped = false;

  private readonly channel: string;

  constructor(private readonly options: TwitchIrcAdapterOptions) {
    this.channel = options.channel.replace(/^#/, '').toLowerCase();
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = undefined;
  }

  // Viewer feedback. Keep messages short; Twitch rejects very long PRIVMSG.
  say(text: string): void {
    const line = text.replaceAll('\r', ' ').replaceAll('\n', ' ').trim().slice(0, 400);

    if (!line || this.socket?.readyState !== WebSocket.OPEN) return;

    this.socket.send(`PRIVMSG #${this.channel} :${line}`);
  }

  private connect(): void {
    const token = this.options.token.replace(/^oauth:/i, '');
    const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.socket = socket;

    socket.on('open', () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      socket.send(`PASS oauth:${token}`);
      socket.send(`NICK ${this.options.nick}`);
      socket.send(`JOIN #${this.channel}`);
      log.info(`Twitch IRC connected as ${this.options.nick} in #${this.channel}`);
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