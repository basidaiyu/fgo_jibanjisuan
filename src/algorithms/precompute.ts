import type { Servant, CraftEssence } from './types';
import { ceMatchesServant } from './bond-calculator';

/** 从者 -> 能吃到加成的礼装索引列表 */
export type ServantCEMap = number[][];

/** 礼装 -> 能覆盖的从者索引列表 */
export type CEServantMap = number[][];

export interface PrecomputedData {
  servants: Servant[];
  craftEssences: CraftEssence[];
  servantCEMap: ServantCEMap;
  ceServantMap: CEServantMap;
  /** 按每个特性分组：特性名 -> 拥有该特性的从者索引 */
  charToServants: Map<string, number[]>;
  /** 按每个特性分组：特性名 -> 对应加成的礼装索引 */
  charToCEs: Map<string, number[]>;
}

export function precompute(
  servants: Servant[],
  craftEssences: CraftEssence[],
): PrecomputedData {
  const n = servants.length;
  const m = craftEssences.length;

  // 从者 -> 礼装映射
  const servantCEMap: ServantCEMap = [];
  for (let si = 0; si < n; si++) {
    const ces: number[] = [];
    for (let ci = 0; ci < m; ci++) {
      if (ceMatchesServant(craftEssences[ci], servants[si])) {
        ces.push(ci);
      }
    }
    servantCEMap.push(ces);
  }

  // 礼装 -> 从者映射
  const ceServantMap: CEServantMap = [];
  for (let ci = 0; ci < m; ci++) {
    const servs: number[] = [];
    for (let si = 0; si < n; si++) {
      if (ceMatchesServant(craftEssences[ci], servants[si])) {
        servs.push(si);
      }
    }
    ceServantMap.push(servs);
  }

  // 特性 -> 从者
  const charToServants = new Map<string, number[]>();
  for (let si = 0; si < n; si++) {
    for (const ch of servants[si].characteristics) {
      if (!charToServants.has(ch)) charToServants.set(ch, []);
      charToServants.get(ch)!.push(si);
    }
  }

  // 特性 -> 礼装（展平 OR 组中的所有条件字符串）
  const charToCEs = new Map<string, number[]>();
  for (let ci = 0; ci < m; ci++) {
    for (const group of craftEssences[ci].conditions) {
      for (const cond of group) {
        if (!charToCEs.has(cond)) charToCEs.set(cond, []);
        charToCEs.get(cond)!.push(ci);
      }
    }
    // 空条件（适用全体的礼装）归入特殊 key
    if (craftEssences[ci].conditions.length === 0) {
      const key = '__ALL__';
      if (!charToCEs.has(key)) charToCEs.set(key, []);
      charToCEs.get(key)!.push(ci);
    }
  }

  return {
    servants,
    craftEssences,
    servantCEMap,
    ceServantMap,
    charToServants,
    charToCEs,
  };
}
