const { spawnSync } = require('child_process');
const r = spawnSync('cmd', ['/c', 'echo', 'hi'], { encoding: 'utf8' });
console.log('status', r.status);
console.log('stdout', r.stdout);
console.log('stderr', r.stderr);
console.log('error', r.error);
