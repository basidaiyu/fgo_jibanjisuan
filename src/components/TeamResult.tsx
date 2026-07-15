import React, { useState, useMemo } from 'react';
import type { OptimizationResult, BondBreakdown, CraftEssence } from '../algorithms/types';

interface Props {
  result: OptimizationResult | null;
  error: string | null;
}

export const TeamResult: React.FC<Props> = ({ result, error }) => {
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const allCEs = useMemo(
    () => result ? result.team.map(s => s.craftEssence) : [],
    [result],
  );

  if (error) {
    return (
      <div className="card">
        <h3>计算错误</h3>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card">
        <h3>结果</h3>
        <p className="hint">设置参数并点击"开始计算"查看最优搭配</p>
      </div>
    );
  }

  const { team, totalBond, totalCost } = result;

  const posLabels = (() => {
    let frontN = 1, backN = 1;
    return team.map((slot) => {
      if (slot.isSupport) return '助战';
      if (slot.isFrontRow) return `前${frontN++}`;
      return `后${backN++}`;
    });
  })();

  return (
    <div className="card">
      <h3>最优搭配结果</h3>

      <div className="result-summary">
        <div className="summary-item">
          <span className="summary-label">总羁绊 (5人)</span>
          <span className="summary-value">{totalBond.toLocaleString()}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">总COST</span>
          <span className="summary-value">{totalCost}</span>
        </div>
      </div>

      <table className="team-table">
        <thead>
          <tr>
            <th></th>
            <th>位置</th>
            <th>从者</th>
            <th>礼装</th>
            <th>羁绊</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {team.map((slot, i) => (
            <React.Fragment key={i}>
              <tr className={`${slot.isSupport ? 'support-row' : ''} ${slot.isFrontRow ? 'front-row' : 'back-row'}`}>
                <td className="avatar-cell">
                  {slot.isSupport ? (
                    <div className="support-avatar-placeholder">援</div>
                  ) : (
                    <img
                      src={slot.servant.imageUrl || '/img/placeholder.svg'}
                      alt={slot.servant.name}
                      className="avatar-img"
                      loading="lazy"
                    />
                  )}
                </td>
                <td className="pos-cell">
                  <span className={`pos-badge ${slot.isSupport ? 'pos-support' : slot.isFrontRow ? 'pos-front' : 'pos-back'}`}>
                    {posLabels[i]}
                  </span>
                </td>
                <td>
                  {slot.isSupport ? (
                    <div className="servant-name" style={{ fontStyle: 'italic', color: 'var(--text)' }}>助战从者</div>
                  ) : (
                    <>
                      <div className="servant-name">{slot.servant.name}</div>
                      <span className="hint">{slot.servant.class} · cost {slot.servant.cost}</span>
                    </>
                  )}
                </td>
                <td>
                  <div className="ce-cell">
                    {slot.craftEssence.imageUrl && (
                      <img src={slot.craftEssence.imageUrl} alt="" className="ce-icon" loading="lazy" />
                    )}
                    <div>
                      <div className="ce-name">{slot.craftEssence.name}</div>
                      <span className="hint">
                        +{slot.craftEssence.bonusPercent}%
                        {slot.craftEssence.conditions.length > 0 && slot.craftEssence.conditions[0].length > 0 &&
                          ` [${slot.craftEssence.conditions.map(g => g.join('+')).join(' or ')}]`}
                        {!slot.isSupport && ` · cost ${slot.craftEssence.cost}`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="bond-cell">
                  {slot.isSupport ? '—' : slot.bondBreakdown.finalBond.toLocaleString()}
                </td>
                <td>
                  {!slot.isSupport && (
                    <button
                      className="btn-sm"
                      onClick={() => setExpandedSlot(expandedSlot === i ? null : i)}
                    >
                      {expandedSlot === i ? '收起' : '明细'}
                    </button>
                  )}
                </td>
              </tr>
              {expandedSlot === i && (
                <tr className="breakdown-row">
                  <td colSpan={6}>
                    <BondDetail
                      breakdown={slot.bondBreakdown}
                      characteristics={slot.servant.characteristics}
                      allCEs={allCEs}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <p className="hint">助战从者不获取羁绊，仅其携带礼装的加成对自有从者生效。助战cost不计入总cost。</p>

      <div className="export-row">
        <button
          className="btn-sm"
          onClick={() => exportJSON(result, 'result')}
        >
          导出结果 JSON
        </button>
      </div>
    </div>
  );
};

const BondDetail: React.FC<{
  breakdown: BondBreakdown;
  characteristics: string[];
  allCEs: CraftEssence[];
}> = ({ breakdown, characteristics, allCEs }) => {
  // 计算每个特性是否被队伍礼装匹配
  const matchedChars = useMemo(() => {
    const set = new Set<string>();
    for (const ce of allCEs) {
      if (ce.conditions.length === 0) continue; // 无条件礼装不标记特定特性
      for (const group of ce.conditions) {
        if (group.length === 0) continue;
        // 该 AND 组全部匹配时，组内所有特性都算"吃到加成"
        if (group.every(c => characteristics.includes(c))) {
          for (const c of group) set.add(c);
        }
      }
    }
    return set;
  }, [characteristics, allCEs]);

  return (
    <div className="bond-detail">
      <div className="detail-grid">
        <div>
          <span className="detail-label">基础羁绊</span>
          <span>{breakdown.baseBond.toLocaleString()}</span>
        </div>
        <div>
          <span className="detail-label">位置乘区</span>
          <span>×{breakdown.positionMultiplier.toFixed(2)}</span>
        </div>
        <div>
          <span className="detail-label">位置结果</span>
          <span>{breakdown.positionResult.toLocaleString()} (向下取整)</span>
        </div>
        <div>
          <span className="detail-label">百分比加成</span>
          <span>+{breakdown.percentBonusSum}%</span>
        </div>
        <div>
          <span className="detail-label">百分比乘区</span>
          <span>×{breakdown.percentMultiplier.toFixed(2)}</span>
        </div>
        <div>
          <span className="detail-label">百分比结果</span>
          <span>{breakdown.percentResult.toLocaleString()} (向下取整)</span>
        </div>
        <div>
          <span className="detail-label">固定加成</span>
          <span>+{breakdown.fixedBonus}</span>
        </div>
        <div>
          <span className="detail-label">固定后值</span>
          <span>{breakdown.afterFixed.toLocaleString()}</span>
        </div>
        <div>
          <span className="detail-label">茶壶倍率</span>
          <span>×{breakdown.teaKettleMultiplier}</span>
        </div>
        <div className="detail-result">
          <span className="detail-label">最终羁绊</span>
          <span className="bond-final">{breakdown.finalBond.toLocaleString()}</span>
        </div>
      </div>
      <div className="detail-chars">
        <span className="detail-label">该从者特性：</span>
        {characteristics.length === 0 && <span className="hint">无</span>}
        {characteristics.map((c) => {
          const isMatch = matchedChars.has(c);
          return (
            <span key={c} className={`tag tag-sm ${isMatch ? 'tag-match' : 'tag-nomatch'}`}>
              {c}
              {isMatch && <span className="match-icon">✓</span>}
            </span>
          );
        })}
        {matchedChars.size > 0 && (
          <span className="hint" style={{ marginLeft: 8 }}>
            ✓ = 吃到礼装加成
          </span>
        )}
      </div>
    </div>
  );
};

function exportJSON(data: unknown, prefix: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fgo-${prefix}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
