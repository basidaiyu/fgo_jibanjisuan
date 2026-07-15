import React, { useState, useMemo } from 'react';
import type { Servant } from '../algorithms/types';

const ALL_CLASSES = [
  '剣士', '弓兵', '槍兵', '騎兵', '術師', '殺人鬼', '狂戦士',
  '裁決者', '復讐者', '盾兵', '降臨者', '月の癌', '分離者', '詐称者', '獣',
];

interface Props {
  servants: Servant[];
  excludedIds: string[];
  requiredIds: string[];
  allowedClasses: string[];
  servantRowPrefs: Record<string, 'front' | 'back'>;
  onExcludedChange: (ids: string[]) => void;
  onRequiredChange: (ids: string[]) => void;
  onClassesChange: (classes: string[]) => void;
  onRowPrefsChange: (prefs: Record<string, 'front' | 'back'>) => void;
  disabled: boolean;
}

export const FilterPanel: React.FC<Props> = ({
  servants,
  excludedIds,
  requiredIds,
  allowedClasses,
  servantRowPrefs,
  onExcludedChange,
  onRequiredChange,
  onClassesChange,
  onRowPrefsChange,
  disabled,
}) => {
  const [search, setSearch] = useState('');

  const toggleClass = (cls: string) => {
    if (allowedClasses.includes(cls)) {
      onClassesChange(allowedClasses.filter((c) => c !== cls));
    } else {
      onClassesChange([...allowedClasses, cls]);
    }
  };

  const toggleAllClasses = () => {
    onClassesChange(allowedClasses.length === 0 ? [...ALL_CLASSES] : []);
  };

  const addRequired = (servant: Servant) => {
    if (!requiredIds.includes(servant.id) && requiredIds.length < 5) {
      onRequiredChange([...requiredIds, servant.id]);
    }
    setSearch('');
  };

  const removeRequired = (id: string) => {
    onRequiredChange(requiredIds.filter((e) => e !== id));
  };

  const addExclude = (servant: Servant) => {
    if (!excludedIds.includes(servant.id)) {
      onExcludedChange([...excludedIds, servant.id]);
    }
    setSearch('');
  };

  const removeExclude = (id: string) => {
    onExcludedChange(excludedIds.filter((e) => e !== id));
  };

  // Filter suggestions based on search
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return servants
      .filter((s) => {
        if (excludedIds.includes(s.id)) return false;
        if (requiredIds.includes(s.id)) return false;
        if (allowedClasses.length > 0 && !allowedClasses.includes(s.class)) return false;
        return (
          s.name.toLowerCase().includes(q) ||
          s.class.includes(q) ||
          s.characteristics.some((c) => c.toLowerCase().includes(q))
        );
      })
      .slice(0, 12);
  }, [search, servants, excludedIds, requiredIds, allowedClasses]);

  const requiredList = servants.filter((s) => requiredIds.includes(s.id));
  const excludedList = servants.filter((s) => excludedIds.includes(s.id));

  return (
    <div className="card">
      <h3>从者筛选</h3>

      {/* 搜索 */}
      <div className="filter-section">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索从者名称/职介/特性..."
          disabled={disabled}
          className="search-input"
        />
        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <div key={s.id} className="suggestion-item">
                <div className="suggestion-info">
                  {s.imageUrl && <img src={s.imageUrl} alt="" className="suggestion-avatar" />}
                  <div>
                    <div className="suggestion-name">
                      {s.name}
                      <span className="hint"> {s.class} cost:{s.cost}</span>
                    </div>
                    <div className="suggestion-chars">
                      {s.characteristics.slice(0, 8).map((c) => (
                        <span key={c} className="tag tag-sm">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="suggestion-actions">
                  <button className="btn-xs btn-req" onClick={() => addRequired(s)} disabled={requiredIds.length >= 5}>
                    必选
                  </button>
                  <button className="btn-xs btn-exc" onClick={() => addExclude(s)}>
                    排除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 职介筛选 */}
      <div className="filter-section">
        <div className="filter-label">
          职介
          <button className="btn-sm" onClick={toggleAllClasses} disabled={disabled}>
            {allowedClasses.length === 0 ? '全选' : '清空'}
          </button>
        </div>
        <div className="class-tags">
          {ALL_CLASSES.map((cls) => (
            <button
              key={cls}
              className={`tag ${allowedClasses.includes(cls) ? 'tag-active' : ''} ${allowedClasses.length === 0 ? 'tag-implicit' : ''}`}
              onClick={() => toggleClass(cls)}
              disabled={disabled}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* 必选从者 */}
      {requiredList.length > 0 && (
        <div className="filter-section">
          <div className="filter-label">必选从者 ({requiredList.length}/5)</div>
          <div className="selected-tags">
            {requiredList.map((s) => {
              const row = servantRowPrefs[s.id];
              return (
                <span key={s.id} className="tag tag-required" style={{ gap: 6 }}>
                  {s.imageUrl && <img src={s.imageUrl} alt="" className="tag-avatar" />}
                  <span>{s.name}</span>
                  <select
                    className="row-select"
                    value={row ?? 'auto'}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next = { ...servantRowPrefs };
                      if (v === 'auto') {
                        delete next[s.id];
                      } else {
                        next[s.id] = v as 'front' | 'back';
                      }
                      onRowPrefsChange(next);
                    }}
                    disabled={disabled}
                    style={{ fontSize: 11, padding: '1px 4px', borderRadius: 4, border: '1px solid #93c5fd' }}
                  >
                    <option value="auto">自动</option>
                    <option value="front">前排</option>
                    <option value="back">后排</option>
                  </select>
                  <button onClick={() => {
                    removeRequired(s.id);
                    const next = { ...servantRowPrefs };
                    delete next[s.id];
                    onRowPrefsChange(next);
                  }} disabled={disabled}>&times;</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 排除从者 */}
      {excludedList.length > 0 && (
        <div className="filter-section">
          <div className="filter-label">排除从者 ({excludedList.length})</div>
          <div className="selected-tags">
            {excludedList.map((s) => (
              <span key={s.id} className="tag tag-exclude">
                {s.name}
                <button onClick={() => removeExclude(s.id)} disabled={disabled}>&times;</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
