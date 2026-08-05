import { spawn } from 'node:child_process';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildPopupSiteFeed } from './build-popup-site-feed.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const outputPath = value('output', 'data/popups.json');
const reportPath = value('run-report', 'data/food-popups/run-report.json');
const rawPath = `${outputPath}.raw-${process.pid}`;
const collectorArgs = args.filter(arg => !arg.startsWith('--output='));

try {
  await mkdir(dirname(rawPath), { recursive: true });
  await copyFile(outputPath, rawPath).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/refresh-food-popups.mjs', ...collectorArgs, `--output=${rawPath}`], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
  else await buildPopupSiteFeed({ inputPath: rawPath, outputPath, reportPath });
} finally {
  await unlink(rawPath).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  });
}
