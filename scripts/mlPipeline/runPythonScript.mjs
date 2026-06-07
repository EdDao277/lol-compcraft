/* global console, process */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error('Usage: node scripts/mlPipeline/runPythonScript.mjs <script.py> [...args]');
  process.exit(1);
}

const candidates = [
  process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : null,
  { command: 'python', args: [] },
  { command: 'python3', args: [] },
  { command: 'py', args: ['-3'] },
  { command: 'C:\\Users\\EdDao\\AppData\\Local\\Python\\bin\\python.exe', args: [] },
].filter(Boolean);

let lastError = '';

for (const candidate of candidates) {
  if (candidate.command.includes('\\') && !existsSync(candidate.command)) {
    continue;
  }

  const probe = spawnSync(candidate.command, [...candidate.args, '--version'], {
    stdio: 'ignore',
    shell: false,
  });
  if (probe.error || probe.status !== 0) {
    lastError = `${candidate.command}: ${probe.error?.message ?? `exited with ${probe.status}`}`;
    continue;
  }

  const result = spawnSync(candidate.command, [...candidate.args, scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    shell: false,
  });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }

  lastError = `${candidate.command}: ${result.error.message}`;
}

console.error('Could not find a working Python executable for ML scripts.');
console.error('Set PYTHON to your python.exe path, then rerun the npm command.');
if (lastError) console.error(lastError);
process.exit(1);
