import React, { useState, useEffect, useRef } from 'react';
import type { AlgorithmMode } from '../algorithms/types';

interface Props {
  mode: AlgorithmMode;
  progress: number;
  currentBest: number;
  running: boolean;
  onModeChange: (mode: AlgorithmMode) => void;
  onCompute: () => void;
  onStop: () => void;
}

export const AlgorithmSelector: React.FC<Props> = ({
  mode,
  progress,
  currentBest,
  running,
  onModeChange,
  onCompute,
  onStop,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [justStarted, setJustStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (running) {
      setElapsed(0);
      setJustStarted(true);
      const timeout = setTimeout(() => setJustStarted(false), 1500);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      // Auto-scroll status area into view
      if (statusRef.current) {
        statusRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return () => {
        clearTimeout(timeout);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setJustStarted(false);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}秒`;
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}分${ss}秒`;
  };

  const estRemaining = progress > 0 && progress < 100
    ? Math.round((elapsed / progress) * (100 - progress))
    : 0;

  return (
    <div className="card">
      <h3>算法与计算</h3>
      <div className="algo-row">
        <label className="radio-label">
          <input
            type="radio"
            name="algo"
            value="exact"
            checked={mode === 'exact'}
            onChange={() => onModeChange('exact')}
            disabled={running}
          />
          精确计算（枚举礼装组合）
          <span className="hint">保证最优解，数秒完成</span>
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name="algo"
            value="heuristic"
            checked={mode === 'heuristic'}
            onChange={() => onModeChange('heuristic')}
            disabled={running}
          />
          快速估算（贪心+局部搜索）
          <span className="hint">秒级出结果，接近最优</span>
        </label>
      </div>

      <div className="compute-row">
        {!running ? (
          <button className="btn-primary" onClick={onCompute}>
            开始计算
          </button>
        ) : (
          <button className="btn-danger" onClick={onStop}>
            停止计算
          </button>
        )}
        {running && (
          <span className="btn-spinner" />
        )}
      </div>

      <div
        className={`compute-status${running ? ' compute-status--active' : ''}${justStarted ? ' compute-status--just-started' : ''}`}
        ref={statusRef}
      >
        {running ? (
          <>
            <div className="status-header">
              <span className="status-indicator" />
              <span>{mode === 'exact' ? '枚举礼装组合计算中...' : '贪心搜索中...'}</span>
              <span className="status-time">已用 {formatTime(elapsed)}</span>
              {estRemaining > 0 && <span className="status-time">预计剩余 {formatTime(estRemaining)}</span>}
            </div>

            <div className="progress-wrap-large">
              <div className="progress-bar-large">
                <div
                  className={`progress-fill-large ${progress < 100 ? 'progress-animated' : ''}`}
                  style={{ width: `${Math.max(progress, 2)}%` }}
                />
              </div>
              <span className="progress-pct">{progress.toFixed(0)}%</span>
            </div>

            {currentBest > 0 && (
              <div className="current-best">
                <span className="best-label">当前最优</span>
                <span className="best-value">{currentBest.toLocaleString()}</span>
                <span className="best-unit">羁绊</span>
              </div>
            )}

            {progress === 0 && (
              <div className="computing-hint">正在初始化搜索...</div>
            )}
          </>
        ) : (
          <div className="computing-hint">点击"开始计算"查看进度</div>
        )}
      </div>
    </div>
  );
};
