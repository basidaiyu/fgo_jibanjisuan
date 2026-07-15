import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Servant, CraftEssence, UserParams, AlgorithmMode,
  OptimizationResult, ComputeMessage, ComputeLog,
} from './algorithms/types';
import { ParameterInput } from './components/ParameterInput';
import { FilterPanel } from './components/FilterPanel';
import { CEFilterPanel } from './components/CEFilterPanel';
import { AlgorithmSelector } from './components/AlgorithmSelector';
import { TeamResult } from './components/TeamResult';
import { DataManager } from './components/DataManager';
import { ComputationLog } from './components/ComputationLog';
import './App.css';

import defaultServantsRaw from '../data/servants.json';
import defaultCraftEssencesRaw from '../data/craft-essences.json';

function migrateCE(ce: Record<string, unknown>): CraftEssence {
  let conds = ce.conditions as string[][] | string[] | undefined;
  if (!conds && ce.condition) {
    conds = [[ce.condition as string]];
  }
  if (!conds || conds.length === 0) {
    conds = [];
  } else if (typeof conds[0] === 'string') {
    // Old format: string[] → wrap in outer array
    conds = [(conds as string[]).filter(c => c.length > 0)];
  }
  return {
    id: ce.id as string,
    name: ce.name as string,
    cost: ce.cost as number,
    bonusPercent: ce.bonusPercent as number,
    conditions: conds as string[][],
    imageUrl: ce.imageUrl as string | undefined,
  };
}

const defaultServants = (defaultServantsRaw as Servant[]).map((s) => ({
  ...s,
  imageUrl: s.imageUrl || undefined,
}));
const defaultCraftEssences = (defaultCraftEssencesRaw as Array<Record<string, unknown>>).map(migrateCE);

const DEFAULT_PARAMS: UserParams = {
  baseBond: 1318,
  teaKettleMultiplier: 1,
  eventBonusPercent: 0,
  fixedBonus: 0,
  supportInFrontRow: true,
  supportRow: 'auto',
  excludedServantIds: [],
  requiredServantIds: [],
  servantRowPrefs: {},
  allowedClasses: [],
  requiredCEIds: [],
  excludedCEIds: [],
  supportCEId: null,
  maxCost: 115,
};

export default function App() {
  const [servants, setServants] = useState<Servant[]>(defaultServants as Servant[]);
  const [craftEssences, setCraftEssences] = useState<CraftEssence[]>(defaultCraftEssences as CraftEssence[]);
  const [params, setParams] = useState<UserParams>(DEFAULT_PARAMS);
  const [mode, setMode] = useState<AlgorithmMode>('heuristic');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentBest, setCurrentBest] = useState(0);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ComputeLog[]>([]);
  const [logVisible, setLogVisible] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (tickRef.current) {
      clearTimeout(tickRef.current);
      tickRef.current = null;
    }
    setRunning(false);
  }, []);

  const startCompute = useCallback(() => {
    setError(null);
    setResult(null);
    setProgress(0);
    setCurrentBest(0);
    setRunning(true);
    setLogs([]);

    terminateWorker();

    const fakeStart = Date.now();
    let realProgressVal = -1;
    // Blend factor: 0 = pure fake, 1 = pure real. Increments when real data arrives.
    let blend = 0;

    const tick = () => {
      const elapsed = (Date.now() - fakeStart) / 1000;
      if (realProgressVal >= 0 && blend < 1) {
        // Gradually blend from fake to real over ~2s (blend += 0.075 per 150ms tick)
        blend = Math.min(1, blend + 0.075);
      }
      if (blend >= 1 && realProgressVal >= 0) {
        setProgress(realProgressVal);
      } else {
        // Conservative fake progress, capped at 25% to avoid overshooting real values
        const fakePct = Math.round(25 * (1 - Math.exp(-elapsed / 6)));
        const clampedFake = Math.max(0, Math.min(25, fakePct));
        const displayPct = realProgressVal >= 0
          ? Math.round(clampedFake * (1 - blend) + realProgressVal * blend)
          : clampedFake;
        setProgress(Math.max(0, displayPct));
      }
      tickRef.current = setTimeout(tick, 150);
    };
    tick();

    const worker = new Worker(
      new URL('./workers/optimization-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<ComputeMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        realProgressVal = msg.percent;
        setCurrentBest(msg.currentBest);
      } else if (msg.type === 'log') {
        setLogs(prev => [...prev, msg]);
      } else if (msg.type === 'done') {
        if (tickRef.current) {
          clearTimeout(tickRef.current);
          tickRef.current = null;
        }
        setProgress(100);
        setRunning(false);
        if (msg.result) {
          setResult(msg.result);
        } else {
          setError((msg as any).error || '计算出错');
        }
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      if (tickRef.current) {
        clearTimeout(tickRef.current);
        tickRef.current = null;
      }
      setRunning(false);
      setError('Worker error: ' + (err.message || String(err)));
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ servants, craftEssences, params, mode });
    workerRef.current = worker;
  }, [servants, craftEssences, params, mode, terminateWorker]);

  const handleDataLoaded = (newServants: Servant[], newCEs: CraftEssence[]) => {
    setServants(newServants);
    setCraftEssences(newCEs);
    setResult(null);
    setError(null);
  };

  useEffect(() => {
    return () => terminateWorker();
  }, [terminateWorker]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>FGO 羁绊加成最优搭配</h1>
        <p className="subtitle">
          从者: {servants.length} · 礼装: {craftEssences.length}
        </p>
      </header>

      <main className="main-grid">
        <div className="left-col">
          <ParameterInput params={params} onChange={setParams} disabled={running} />
          <FilterPanel
            servants={servants}
            excludedIds={params.excludedServantIds}
            requiredIds={params.requiredServantIds}
            allowedClasses={params.allowedClasses}
            servantRowPrefs={params.servantRowPrefs}
            onExcludedChange={(ids) => setParams({ ...params, excludedServantIds: ids })}
            onRequiredChange={(ids) => setParams({ ...params, requiredServantIds: ids })}
            onClassesChange={(classes) => setParams({ ...params, allowedClasses: classes })}
            onRowPrefsChange={(prefs) => setParams({ ...params, servantRowPrefs: prefs })}
            disabled={running}
          />
          <CEFilterPanel
            craftEssences={craftEssences}
            requiredIds={params.requiredCEIds}
            excludedIds={params.excludedCEIds}
            supportCEId={params.supportCEId}
            onRequiredChange={(ids) => setParams({ ...params, requiredCEIds: ids })}
            onExcludedChange={(ids) => setParams({ ...params, excludedCEIds: ids })}
            onSupportCEChange={(id) => setParams({ ...params, supportCEId: id })}
            disabled={running}
          />
          <AlgorithmSelector
            mode={mode}
            progress={progress}
            currentBest={currentBest}
            running={running}
            onModeChange={setMode}
            onCompute={startCompute}
            onStop={terminateWorker}
          />
          <DataManager
            servants={servants}
            craftEssences={craftEssences}
            onDataLoaded={handleDataLoaded}
          />
          <ComputationLog
            logs={logs}
            visible={logVisible}
            onToggle={() => setLogVisible(v => !v)}
          />
        </div>

        <div className="right-col">
          <TeamResult result={result} error={error} />
        </div>
      </main>
    </div>
  );
}
