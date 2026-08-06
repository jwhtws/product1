import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildPopupSiteFeed } from './build-popup-site-feed.mjs';
import { runPopupContentAudit } from './audit-popup-content.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const outputPath = value('output', 'data/popups.json');
const reportPath = value('run-report', 'data/food-popups/run-report.json');
const reviewPath = value('review-output', 'data/popup-review-queue.json');
const auditPath = value('audit-output', 'data/popup-content-audit.json');
const coveragePath = value('coverage-output', 'data/popup-coverage.json');
const maxPublishDrop = Number(value('max-publish-drop', '0.20'));
const rawPath = `${outputPath}.raw-${process.pid}`;
const evaluatedPath = `${outputPath}.evaluated-${process.pid}`;
const candidatePath = `${outputPath}.candidate-${process.pid}`;
const coverageCandidatePath = `${coveragePath}.candidate-${process.pid}`;
const collectorArgs = args.filter(arg => !arg.startsWith('--output=') && !arg.startsWith('--coverage-output='));

try {
  await mkdir(dirname(rawPath), { recursive: true });
  let currentPayload = { sources: [], stats: {}, popups: [] };
  try { currentPayload = JSON.parse(await readFile(outputPath, 'utf8')); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  let reviewQueue = { reviewRequired: [], rejected: [] };
  try { reviewQueue = JSON.parse(await readFile(reviewPath, 'utf8')); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const retained = new Map([
    ...(currentPayload.popups || []), ...(reviewQueue.reviewRequired || []), ...(reviewQueue.rejected || [])
  ].map(row => [row.id, row]));
  await writeFile(rawPath, `${JSON.stringify({ ...currentPayload, popups: [...retained.values()] }, null, 2)}\n`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      'scripts/refresh-food-popups.mjs', ...collectorArgs,
      `--output=${rawPath}`, `--coverage-output=${coverageCandidatePath}`
    ], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
  else {
    const audit = await runPopupContentAudit({
      inputPath: rawPath, outputPath: evaluatedPath, reviewPath, reportPath: auditPath,
      previousRows: currentPayload.popups || []
    });
    await buildPopupSiteFeed({ inputPath: evaluatedPath, outputPath: candidatePath, reportPath });
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    const previousCount = (currentPayload.popups || []).length;
    const candidateCount = candidate.popups.length;
    if (previousCount >= 10 && candidateCount < previousCount * (1 - maxPublishDrop)) {
      throw new Error(`품질 정책 공개 건수 급감 보호: ${previousCount}건 → ${candidateCount}건 (${Math.round(maxPublishDrop * 100)}% 초과), 사용자 feed 반영 중단`);
    }
    if (audit.auditReport.invariants.publishedValidImageRate !== 1 || audit.auditReport.invariants.publishedMenuRate !== 1) {
      throw new Error('공개 후보의 유효 이미지 또는 메뉴 완전성이 100%가 아닙니다.');
    }
    await rename(coverageCandidatePath, coveragePath).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
    await rename(candidatePath, outputPath);
  }
} finally {
  for (const path of [rawPath, evaluatedPath, candidatePath, coverageCandidatePath]) {
    await unlink(path).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  }
}
