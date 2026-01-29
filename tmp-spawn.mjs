import { spawnSync } from 'node:child_process';

const result = spawnSync('cmd', ['/c', 'echo', 'hi'], { encoding: 'utf8' });
console.log('status', result.status);
console.log('error', result.error);
console.log('stdout', result.stdout);
console.log('stderr', result.stderr);
