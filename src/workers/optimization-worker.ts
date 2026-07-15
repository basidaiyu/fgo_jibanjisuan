import type { ComputeRequest, ComputeMessage, ComputeLog, Logger } from '../algorithms/types';
import { precompute } from '../algorithms/precompute';
import { bruteForceOptimize } from '../algorithms/brute-force';
import { heuristicOptimize } from '../algorithms/heuristic';

self.onmessage = (e: MessageEvent<ComputeRequest>) => {
  const { servants, craftEssences, params, mode } = e.data;

  try {
    const startTime = performance.now();

    const log: Logger = (level, message, data) => {
      const msg: ComputeLog = {
        type: 'log',
        level,
        message,
        data,
        timestamp: Date.now(),
      };
      self.postMessage(msg);
    };

    log('info', '开始计算', { mode, servants: servants.length, ces: craftEssences.length });
    log('debug', '参数', {
      baseBond: params.baseBond,
      teaKettle: params.teaKettleMultiplier,
      eventBonus: params.eventBonusPercent,
      maxCost: params.maxCost,
      requiredServants: params.requiredServantIds.length,
      requiredCEs: params.requiredCEIds.length,
      excludedServants: params.excludedServantIds.length,
      excludedCEs: params.excludedCEIds.length,
      allowedClasses: params.allowedClasses,
      rowPrefs: Object.keys(params.servantRowPrefs).length,
      supportInFront: params.supportInFrontRow,
    });

    const pre = precompute(servants, craftEssences);
    log('debug', '预计算完成', {
      servantCEMapEntries: pre.servantCEMap.reduce((s, arr) => s + arr.length, 0),
    });

    const onProgress = (percent: number, currentBest: number) => {
      const msg: ComputeMessage = { type: 'progress', percent, currentBest };
      self.postMessage(msg);
    };

    const result =
      mode === 'exact'
        ? bruteForceOptimize(pre, params, onProgress, log)
        : heuristicOptimize(pre, params, onProgress, log);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    log('info', '计算完成', {
      elapsedSec: parseFloat(elapsed),
      totalBond: result.totalBond,
      totalCost: result.totalCost,
      teamSize: result.team.length,
    });

    const msg: ComputeMessage = { type: 'done', result };
    self.postMessage(msg);
  } catch (err: any) {
    const errorMsg: ComputeMessage = {
      type: 'done',
      result: null as any,
    };
    (errorMsg as any).error = err.message || String(err);
    self.postMessage(errorMsg);
    self.postMessage({
      type: 'log',
      level: 'error',
      message: '计算异常: ' + (err.message || String(err)),
      timestamp: Date.now(),
    } satisfies ComputeLog);
  }
};
