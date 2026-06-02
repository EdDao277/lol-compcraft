import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadPipelineEnv(filePath = '.env.pipeline') {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) return;

  for (const line of readFileSync(resolved, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function requirePipelineEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
