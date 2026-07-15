import React, { useRef } from 'react';
import type { Servant, CraftEssence } from '../algorithms/types';

interface Props {
  servants: Servant[];
  craftEssences: CraftEssence[];
  onDataLoaded: (servants: Servant[], craftEssences: CraftEssence[]) => void;
}

export const DataManager: React.FC<Props> = ({
  servants,
  craftEssences,
  onDataLoaded,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        if (json.servants && json.craftEssences) {
          onDataLoaded(json.servants, json.craftEssences);
        } else if (Array.isArray(json)) {
          // 尝试判断是从者还是礼装
          if (json[0]?.characteristics) {
            onDataLoaded(json, craftEssences);
          } else if (json[0]?.bonusPercent !== undefined) {
            onDataLoaded(servants, json);
          }
        }
      } catch {
        alert('JSON 格式错误，请检查文件');
      }
    };
    reader.readAsText(file);
  };

  const exportAll = () => {
    const data = { servants, craftEssences };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fgo-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <h3>数据管理</h3>
      <div className="data-info">
        <span>从者: {servants.length} 人</span>
        <span>礼装: {craftEssences.length} 件</span>
      </div>
      <div className="data-actions">
        <button className="btn-sm" onClick={() => fileRef.current?.click()}>
          导入 JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
        <button className="btn-sm" onClick={exportAll}>
          导出全部数据
        </button>
      </div>
    </div>
  );
};
