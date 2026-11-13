export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const value = process.env.SIMSAND_LOG_LEVEL;
  return value !== undefined && value in LEVELS ? (value as LogLevel) : 'info';
}

const minimum = LEVELS[configuredLevel()];

function write(level: LogLevel, message: string, details: unknown[]): void {
  if (LEVELS[level] < minimum) return;

  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const output = level === 'warn' || level === 'error' ? console.error : console.log;

  output(line, ...details);
}

// Timestamped, level-filtered console output (SIMSAND_LOG_LEVEL, default info).
export const log = {
  debug: (message: string, ...details: unknown[]) => write('debug', message, details),
  info: (message: string, ...details: unknown[]) => write('info', message, details),
  warn: (message: string, ...details: unknown[]) => write('warn', message, details),
  error: (message: string, ...details: unknown[]) => write('error', message, details),
};
