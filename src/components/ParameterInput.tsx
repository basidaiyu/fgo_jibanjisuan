import React from 'react';
import type { UserParams } from '../algorithms/types';

interface Props {
  params: UserParams;
  onChange: (params: UserParams) => void;
  disabled: boolean;
}

export const ParameterInput: React.FC<Props> = ({ params, onChange, disabled }) => {
  const update = (patch: Partial<UserParams>) =>
    onChange({ ...params, ...patch });

  return (
    <div className="card">
      <h3>关卡参数</h3>
      <div className="param-grid">
        <label>
          基础羁绊值
          <input
            type="number"
            value={params.baseBond}
            onChange={(e) => update({ baseBond: Number(e.target.value) || 0 })}
            disabled={disabled}
            min={0}
          />
        </label>
        <label>
          茶壶倍率
          <select
            value={params.teaKettleMultiplier}
            onChange={(e) => update({ teaKettleMultiplier: Number(e.target.value) })}
            disabled={disabled}
          >
            <option value={1}>无茶壶 (×1)</option>
            <option value={2}>茶壶 (×2)</option>
            <option value={3}>午茶 (×3)</option>
          </select>
        </label>
        <label>
          活动加成 (%)
          <input
            type="number"
            value={params.eventBonusPercent}
            onChange={(e) => update({ eventBonusPercent: Number(e.target.value) || 0 })}
            disabled={disabled}
            min={0}
            max={999}
          />
        </label>
        <label>
          固定加成 (点)
          <input
            type="number"
            value={params.fixedBonus}
            onChange={(e) => update({ fixedBonus: Number(e.target.value) || 0 })}
            disabled={disabled}
            min={0}
          />
        </label>
      </div>
      <div className="param-grid" style={{ marginTop: 10 }}>
        <label>
          COST 上限
          <input
            type="number"
            value={params.maxCost}
            onChange={(e) => update({ maxCost: Number(e.target.value) || 0 })}
            disabled={disabled}
            min={0}
            max={200}
          />
        </label>
        <label>
          助战位置
          <select
            value={params.supportRow}
            onChange={(e) => update({ supportRow: e.target.value as 'auto' | 'front' | 'back' })}
            disabled={disabled}
          >
            <option value="auto">自动</option>
            <option value="front">强制前排</option>
            <option value="back">强制后排</option>
          </select>
        </label>
      </div>
    </div>
  );
};
