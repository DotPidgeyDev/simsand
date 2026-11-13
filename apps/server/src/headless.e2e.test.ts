import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const TSX = join(SERVER_DIR, 'node_modules', '.bin', 'tsx');

interface Status {
  server: { browserClients: number };
  simulation: { tick: number; population: number; ticksDropped: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs the real server, worker and SQLite store with no browser attached.
describe('headless server', () => {
  let server: ChildProcessWithoutNullStreams;
  let output = '';
  let dataDir: string;
  let inspectUrl: string;
  let wsPort: number;

  function waitForOutput(pattern: RegExp, timeoutMs = 15_000): Promise<RegExpMatchArray> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        clearInterval(poll);
        reject(new Error(`Timed out waiting for ${pattern}. Output so far:\n${output}`));
      }, timeoutMs);

      const poll = setInterval(() => {
        const match = output.match(pattern);
        if (match) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve(match);
        }
      }, 50);
    });
  }

  async function status(): Promise<Status> {
    const response = await fetch(`${inspectUrl}/status`);
    expect(response.status).toBe(200);
    return response.json() as Promise<Status>;
  }

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'simsand-e2e-'));

    server = spawn(TSX, ['src/index.ts'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        SIMSAND_DB_PATH: join(dataDir, 'world.sqlite'),
        SIMSAND_WS_PORT: '0',
        SIMSAND_INSPECT_PORT: '0',
        SIMSAND_LOG_LEVEL: 'info',
      },
    });

    server.stdout.on('data', (chunk) => { output += chunk; });
    server.stderr.on('data', (chunk) => { output += chunk; });

    inspectUrl = (await waitForOutput(/Inspection API listening on (http:\/\/\S+)/))[1];
    wsPort = Number((await waitForOutput(/WebSocket server listening on port (\d+)/))[1]);
    await waitForOutput(/Saved world at tick \d+ \(baseline\)/);
  }, 30_000);

  afterAll(() => {
    if (server.exitCode === null) server.kill('SIGKILL');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('keeps simulating before, during and after a browser connection', async () => {
    const initial = await status();
    expect(initial.server.browserClients).toBe(0);
    expect(initial.simulation.population).toBe(20);

    await sleep(1000);
    const withoutClients = await status();
    expect(withoutClients.simulation.tick - initial.simulation.tick).toBeGreaterThanOrEqual(5);

    const client = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    const firstMessage = await new Promise<{ type: string }>((resolve, reject) => {
      client.once('message', (data) => resolve(JSON.parse(String(data))));
      client.once('error', reject);
    });
    expect(firstMessage.type).toBe('world.snapshot');
    expect((await status()).server.browserClients).toBe(1);

    client.close();
    await new Promise((resolve) => client.once('close', resolve));
    const atDisconnect = await status();

    await sleep(1000);
    const afterDisconnect = await status();
    expect(afterDisconnect.server.browserClients).toBe(0);
    expect(afterDisconnect.simulation.tick - atDisconnect.simulation.tick).toBeGreaterThanOrEqual(5);
    expect(afterDisconnect.simulation.ticksDropped).toBe(0);
  }, 20_000);

  it('saves and exits cleanly on SIGTERM', async () => {
    const exited = new Promise<number | null>((resolve) => server.once('exit', resolve));

    server.kill('SIGTERM');

    expect(await exited).toBe(0);
    expect(output).toMatch(/Saved world at tick \d+ \(shutdown\)/);
  }, 15_000);
});
