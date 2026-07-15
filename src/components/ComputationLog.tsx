import React, { useEffect, useRef } from 'react';
import type { ComputeLog } from '../algorithms/types';

interface Props {
  logs: ComputeLog[];
  visible: boolean;
  onToggle: () => void;
}

const LEVEL_LABELS: Record<ComputeLog['level'], { label: string; color: string }> = {
  error: { label: 'ERR', color: '#dc2626' },
  warn:  { label: 'WRN', color: '#d97706' },
  info:  { label: 'INF', color: '#2563eb' },
  debug: { label: 'DBG', color: '#6b7280' },
};

export const ComputationLog: React.FC<Props> = ({ logs, visible, onToggle }) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, visible]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }} onClick={onToggle}>
        <span>计算日志 ({logs.length})</span>
        <span className="hint">{visible ? '收起' : '展开'}</span>
      </h3>

      {visible && (
        <div className="log-container">
          {logs.length === 0 && <p className="hint">暂无日志</p>}
          {logs.map((entry, i) => {
            const lc = LEVEL_LABELS[entry.level];
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <div key={i} className="log-entry" style={{ borderLeftColor: lc.color }}>
                <span className="log-time">{time}</span>
                <span className="log-level" style={{ color: lc.color }}>[{lc.label}]</span>
                <span className="log-msg">{entry.message}</span>
                {entry.data && Object.keys(entry.data).length > 0 && (
                  <span className="log-data">
                    {Object.entries(entry.data).map(([k, v]) => (
                      <span key={k} className="log-kv">
                        {k}={typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
};
