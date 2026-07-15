import React, { useState, useMemo } from 'react';
import type { CraftEssence } from '../algorithms/types';

interface Props {
  craftEssences: CraftEssence[];
  requiredIds: string[];
  excludedIds: string[];
  supportCEId: string | null;
  onRequiredChange: (ids: string[]) => void;
  onExcludedChange: (ids: string[]) => void;
  onSupportCEChange: (id: string | null) => void;
  disabled: boolean;
}

export const CEFilterPanel: React.FC<Props> = ({
  craftEssences,
  requiredIds,
  excludedIds,
  supportCEId,
  onRequiredChange,
  onExcludedChange,
  onSupportCEChange,
  disabled,
}) => {
  const [search, setSearch] = useState('');
  const [supDrawer, setSupDrawer] = useState(false);
  const [supSearch, setSupSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return craftEssences
      .filter((ce) => {
        if (requiredIds.includes(ce.id) || excludedIds.includes(ce.id)) return false;
        return ce.name.toLowerCase().includes(q) ||
          ce.conditions.some((g) => g.some((c) => c.toLowerCase().includes(q)));
      })
      .slice(0, 10);
  }, [search, craftEssences, requiredIds, excludedIds]);

  const supCEList = useMemo(() => {
    const q = supSearch.trim().toLowerCase();
    return craftEssences
      .filter((ce) => {
        if (excludedIds.includes(ce.id)) return false;
        if (!q) return true;
        return ce.name.toLowerCase().includes(q) ||
          ce.conditions.some((g) => g.some((c) => c.toLowerCase().includes(q)));
      });
  }, [supSearch, craftEssences, excludedIds]);

  const addRequired = (ce: CraftEssence) => {
    onRequiredChange([...requiredIds, ce.id]);
    setSearch('');
  };

  const addExclude = (ce: CraftEssence) => {
    onExcludedChange([...excludedIds, ce.id]);
    setSearch('');
  };

  const removeReq = (id: string) => onRequiredChange(requiredIds.filter((r) => r !== id));
  const removeExc = (id: string) => onExcludedChange(excludedIds.filter((r) => r !== id));

  const requiredList = craftEssences.filter((c) => requiredIds.includes(c.id));
  const excludedList = craftEssences.filter((c) => excludedIds.includes(c.id));
  const supportCE = supportCEId ? craftEssences.find((c) => c.id === supportCEId) : null;

  return (
    <div className="card">
      <h3>礼装筛选</h3>

      {/* 助战礼装 - 抽屉式选择 */}
      <div className="filter-section">
        <div className="filter-label">助战礼装</div>
        <button
          className="sup-trigger"
          onClick={() => setSupDrawer(!supDrawer)}
          disabled={disabled}
        >
          {supportCE ? (
            <span className="sup-trigger-selected">
              {supportCE.imageUrl && <img src={supportCE.imageUrl} alt="" className="tag-avatar" />}
              <span className="sup-trigger-name">{supportCE.name}</span>
              <span className="hint">+{supportCE.bonusPercent}%</span>
            </span>
          ) : (
            <span className="hint">自动选择最优</span>
          )}
          <span className="sup-trigger-arrow">{supDrawer ? '▲' : '▼'}</span>
        </button>

        {supDrawer && (
          <div className="sup-drawer">
            <div className="sup-drawer-search">
              <input
                type="text"
                value={supSearch}
                onChange={(e) => setSupSearch(e.target.value)}
                placeholder="搜索礼装..."
                disabled={disabled}
                className="search-input"
              />
            </div>
            <div className="sup-drawer-list">
              <div
                className={`sup-drawer-item ${supportCEId === null ? 'sup-drawer-item--active' : ''}`}
                onClick={() => { onSupportCEChange(null); setSupDrawer(false); setSupSearch(''); }}
              >
                <span className="hint">自动选择最优</span>
              </div>
              {supCEList.map((ce) => (
                <div
                  key={ce.id}
                  className={`sup-drawer-item ${supportCEId === ce.id ? 'sup-drawer-item--active' : ''}`}
                  onClick={() => { onSupportCEChange(ce.id); setSupDrawer(false); setSupSearch(''); }}
                >
                  {ce.imageUrl && <img src={ce.imageUrl} alt="" className="suggestion-avatar" />}
                  <div className="sup-drawer-info">
                    <span className="sup-drawer-name">{ce.name}</span>
                    <span className="hint">
                      +{ce.bonusPercent}%
                      {ce.conditions.length > 0 && ce.conditions[0].length > 0 &&
                        ` [${ce.conditions.map(g => g.join('+')).join(' or ')}]`}
                      {' '}cost:{ce.cost}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 必选/排除搜索 */}
      <div className="filter-section">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索礼装名称/条件..."
          disabled={disabled}
          className="search-input"
        />
        {filtered.length > 0 && (
          <div className="suggestions">
            {filtered.map((ce) => (
              <div key={ce.id} className="suggestion-item">
                <div className="suggestion-info">
                  {ce.imageUrl && <img src={ce.imageUrl} alt="" className="suggestion-avatar" />}
                  <div>
                    <span>{ce.name}</span>
                    <span className="hint"> +{ce.bonusPercent}%</span>
                    {ce.conditions.length > 0 && ce.conditions[0].length > 0 && (
                      <span className="hint"> [{ce.conditions.map((g) => g.join('+')).join(' or ')}]</span>
                    )}
                    <span className="hint"> cost:{ce.cost}</span>
                  </div>
                </div>
                <div className="suggestion-actions">
                  <button className="btn-xs btn-req" onClick={() => addRequired(ce)}>
                    必选
                  </button>
                  <button className="btn-xs btn-exc" onClick={() => addExclude(ce)}>
                    排除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {requiredList.length > 0 && (
        <div className="filter-section">
          <div className="filter-label">必选礼装 ({requiredList.length})</div>
          <div className="selected-tags">
            {requiredList.map((ce) => (
              <span key={ce.id} className="tag tag-required">
                {ce.imageUrl && <img src={ce.imageUrl} alt="" className="tag-avatar" />}
                {ce.name} +{ce.bonusPercent}%
                <button onClick={() => removeReq(ce.id)} disabled={disabled}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {excludedList.length > 0 && (
        <div className="filter-section">
          <div className="filter-label">排除礼装 ({excludedList.length})</div>
          <div className="selected-tags">
            {excludedList.map((ce) => (
              <span key={ce.id} className="tag tag-exclude">
                {ce.name}
                <button onClick={() => removeExc(ce.id)} disabled={disabled}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
