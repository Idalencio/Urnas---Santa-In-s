import { renameSync, copyFileSync, rmSync } from 'node:fs';
renameSync('../public/index.html', '../public/app.html');
copyFileSync('../server/index.php', '../public/index.php');
rmSync('../public/previa-windows.html', { force: true });
console.log('Interface compilada e servidor PHP preparados em public/.');

const { spawnSync } = await import('node:child_process');
const v2 = spawnSync(process.execPath, ['v2/build.mjs'], { stdio: 'inherit' });
if (v2.status !== 0) process.exit(v2.status || 1);
