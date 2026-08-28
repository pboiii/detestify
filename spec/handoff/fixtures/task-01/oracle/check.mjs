import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = process.env.FIXTURE_REPO;
if (!repo) throw new Error('FIXTURE_REPO is required');
const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: repo, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
if (changed.some((path) => path.startsWith('src/') || path.startsWith('test/'))) {
  throw new Error(`documentation task changed executable evidence: ${changed.join(', ')}`);
}
if (changed.some((path) => path !== 'README.md')) {
  throw new Error(`unexpected changed path: ${changed.join(', ')}`);
}
const readme = readFileSync(resolve(repo, 'README.md'), 'utf8');
if (!readme.includes('every run of internal')) throw new Error('required documentation correction missing');
