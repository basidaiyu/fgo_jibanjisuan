import type { UserParams, OptimizationResult, TeamSlot, Servant, CraftEssence, Logger } from './types';
import { calculateBond } from './bond-calculator';
import type { PrecomputedData } from './precompute';

/**
 * 精确算法：枚举所有礼装组合 + DP 选取最优从者。
 *
 * 礼装池很小（~19张），C(19,6)=27132 种组合可枚举。
 * 固定礼装组合后，DP 在 O(n*F*B) 内选出最优从者及位置分配。
 */

// ──── 工具函数：枚举组合 ────

function enumerateCombos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const result: T[][] = [];
  function backtrack(start: number, cur: T[]): void {
    if (cur.length === k) { result.push([...cur]); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]);
      backtrack(i + 1, cur);
      cur.pop();
    }
  }
  backtrack(0, []);
  return result;
}

// ──── 辅助函数 ────

interface CandBond {
  si: number;
  front: number;
  back: number;
}

/** 快速版羁绊计算：接收预计算的 bonusSum，跳过 CE 匹配 */
function fastBond(
  baseBond: number,
  bonusSum: number,
  eventBonus: number,
  isFront: boolean,
  supportInFront: boolean,
  fixedBonus: number,
  teaKettleMult: number,
): number {
  const posMult = 1 + (isFront ? 0.2 : 0) + (supportInFront ? 0.04 : 0);
  const totalPercent = bonusSum + eventBonus;
  const posResult = Math.floor(baseBond * posMult);
  const pctResult = Math.floor(posResult * (1 + totalPercent / 100));
  const afterFixed = pctResult + fixedBonus;
  return Math.floor(afterFixed * teaKettleMult);
}

/** 预计算每个从者对于每个礼装是否有加成（bool 矩阵，加快内层求和） */
function buildCEMatchMatrix(
  servants: Servant[],
  craftEssences: CraftEssence[],
): boolean[][] {
  return servants.map(s =>
    craftEssences.map(ce => {
      if (ce.conditions.length === 0) return true;
      return ce.conditions.some(g =>
        g.length > 0 && g.every(c => s.characteristics.includes(c)),
      );
    }),
  );
}

// ──── 选最优从者：DP（快照法防重复）────

interface DPState {
  value: number;
  selections: { si: number; isFront: boolean }[];
}

/**
 * 从 candidates 中选 needF 前排 + needB 后排，在总 COST 不超 maxServantCost 的前提下使总羁绊最大。
 * 每轮迭代拷贝旧 dp 表再更新，彻底杜绝同一从者在 DP 中被重复选取。
 */
function pickBestServants(
  candidates: CandBond[],
  needF: number,
  needB: number,
  maxServantCost: number,
  servants: Servant[],
): { selected: { si: number; isFront: boolean }[]; total: number } | null {
  if (needF === 0 && needB === 0) {
    return { selected: [], total: 0 };
  }
  if (candidates.length < needF + needB) return null;

  // dp[f][b][cost] = best bond value
  const maxC = maxServantCost;
  const dp: (DPState | null)[][][] = Array.from(
    { length: needF + 1 },
    () => Array.from(
      { length: needB + 1 },
      () => Array(maxC + 1).fill(null),
    ),
  );
  dp[0][0][0] = { value: 0, selections: [] };

  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
    const sc = servants[c.si].cost;

    // 深拷贝旧 dp，确保本轮候选只基于本轮开始前的状态
    const oldDp: (DPState | null)[][][] = dp.map(row =>
      row.map(costs => costs.map(cell =>
        cell ? { value: cell.value, selections: [...cell.selections] } : null,
      )),
    );

    // 尝试前排
    for (let f = 0; f < needF; f++) {
      for (let b = 0; b <= needB; b++) {
        for (let cost = 0; cost + sc <= maxC; cost++) {
          const src = oldDp[f][b][cost];
          if (!src) continue;
          const nc = cost + sc;
          const nv = src.value + c.front;
          if (!dp[f + 1][b][nc] || nv > dp[f + 1][b][nc]!.value) {
            dp[f + 1][b][nc] = {
              value: nv,
              selections: [...src.selections, { si: c.si, isFront: true }],
            };
          }
        }
      }
    }

    // 尝试后排
    for (let f = 0; f <= needF; f++) {
      for (let b = 0; b < needB; b++) {
        for (let cost = 0; cost + sc <= maxC; cost++) {
          const src = oldDp[f][b][cost];
          if (!src) continue;
          const nc = cost + sc;
          const nv = src.value + c.back;
          if (!dp[f][b + 1][nc] || nv > dp[f][b + 1][nc]!.value) {
            dp[f][b + 1][nc] = {
              value: nv,
              selections: [...src.selections, { si: c.si, isFront: false }],
            };
          }
        }
      }
    }
  }

  // 在不超过预算的前提下找最优解
  let best: DPState | null = null;
  for (let cost = 0; cost <= maxC; cost++) {
    const cell = dp[needF][needB][cost];
    if (cell && (!best || cell.value > best.value)) {
      best = cell;
    }
  }
  if (!best) return null;
  return { selected: best.selections, total: best.value };
}

// ──── 主优化函数 ────

export function bruteForceOptimize(
  pre: PrecomputedData,
  params: UserParams,
  onProgress?: (percent: number, currentBest: number) => void,
  log?: Logger,
): OptimizationResult {
  const { servants, craftEssences } = pre;
  const L = log ?? (() => {});

  L('info', '精确计算开始', { servants: servants.length, ces: craftEssences.length });

  // ── 过滤从者 ──
  const availList = servants
    .map((_, i) => i)
    .filter((i) => {
      const s = servants[i];
      if (params.excludedServantIds.includes(s.id)) return false;
      if (params.allowedClasses.length > 0 && !params.allowedClasses.includes(s.class)) return false;
      return true;
    });
  const availSet = new Set(availList);
  L('info', '从者筛选完成', { available: availList.length, total: servants.length });

  const reqSI = params.requiredServantIds
    .map(id => servants.findIndex(s => s.id === id))
    .filter(i => i >= 0 && availSet.has(i));

  if (reqSI.length > 5) {
    throw new Error(`必选从者不能超过5人`);
  }

  const reqSupport = reqSI.length === 5 ? reqSI[4] : null;
  const reqNonSup = reqSI.length === 5 ? reqSI.slice(0, 4) : reqSI;

  // 非必选可用从者
  const freeServants = [...availSet].filter(i => !reqSI.includes(i));

  // ── 过滤礼装 ──
  const availCEs = craftEssences
    .map((_, i) => i)
    .filter((i) => {
      if (params.excludedCEIds.includes(craftEssences[i].id)) return false;
      return true;
    });

  const reqCEs = params.requiredCEIds
    .map(id => craftEssences.findIndex(c => c.id === id))
    .filter(i => i >= 0 && availCEs.includes(i));

  // ── 礼装不足时补充空礼装兜底 ──
  // 构建扩展礼装数组（含空礼装），索引 >= origLen 的是空礼装
  const origCELen = craftEssences.length;
  let craftEssencesExt = craftEssences;
  const needCEs = 6 - reqCEs.length;
  const shortage = Math.max(0, needCEs - (availCEs.length - reqCEs.length));
  for (let d = 0; d < shortage; d++) {
    craftEssencesExt = [...craftEssencesExt, {
      id: `__dummy_${d}__`, name: '无礼装', cost: 0, bonusPercent: 0, conditions: [] as string[][],
    }];
  }
  // 扩展后重新计算 available CEs
  const allAvailCEs = craftEssencesExt
    .map((_, i) => i)
    .filter(i => {
      if (i >= origCELen) return true; // 空礼装始终可用
      return !params.excludedCEIds.includes(craftEssencesExt[i].id);
    });
  const reqCEsExt = params.requiredCEIds
    .map(id => craftEssencesExt.findIndex(c => c.id === id))
    .filter(i => i >= 0 && allAvailCEs.includes(i));
  const freeCEsExt = allAvailCEs.filter(i => !reqCEsExt.includes(i));

  // ── 预计算 CE 匹配矩阵（扩展后）──
  const ceMatch = buildCEMatchMatrix(servants, craftEssencesExt);
  const ceBonuses = craftEssencesExt.map(ce => ce.bonusPercent);
  L('debug', 'CE 匹配矩阵构建完成');

  // ── 礼装分组优化：同效果礼装不重复枚举 ──
  const uncond10 = freeCEsExt.filter(i => i < origCELen && craftEssencesExt[i].conditions.length === 0 && craftEssencesExt[i].bonusPercent === 10);
  const uncond5  = freeCEsExt.filter(i => i < origCELen && craftEssencesExt[i].conditions.length === 0 && craftEssencesExt[i].bonusPercent === 5);
  const condCEs  = freeCEsExt.filter(i => i < origCELen && craftEssencesExt[i].conditions.length > 0);
  const uncond0  = freeCEsExt.filter(i => i >= origCELen); // 空礼装

  // ── 主力 5 张礼装枚举（互不相同），第 6 张助战礼装可重复使用 ──
  const needCEsMain = 5 - reqCEsExt.length; // 非助战还需要几张
  const maxUncond10_m = Math.min(uncond10.length, needCEsMain);
  const maxUncond5_m  = Math.min(uncond5.length, needCEsMain);
  const maxUncond0_m  = Math.min(uncond0.length, needCEsMain);

  const ceComboList: number[][] = [];
  for (let c = 0; c <= Math.min(needCEsMain, condCEs.length); c++) {
    const condCombos = enumerateCombos(condCEs, c);
    const fillCount = needCEsMain - c;
    for (const condSel of condCombos) {
      const combo = [...condSel];
      let remaining = fillCount;
      for (let i = 0; i < maxUncond10_m && remaining > 0; i++, remaining--) combo.push(uncond10[i]);
      for (let i = 0; i < maxUncond5_m && remaining > 0; i++, remaining--) combo.push(uncond5[i]);
      for (let i = 0; i < maxUncond0_m && remaining > 0; i++, remaining--) combo.push(uncond0[i]);
      if (remaining === 0) ceComboList.push(combo);
    }
  }
  const totalCombos = ceComboList.length;

  // 助战候选礼装：所有可用礼装（不分条件/无条件，因为可以重复主力礼装）
  const supCECands = allAvailCEs.filter(i => {
    if (i >= origCELen) return true; // 空礼装始终可用
    return !params.excludedCEIds.includes(craftEssencesExt[i].id);
  });

  L('info', '礼装组合枚举完成', {
    total_main: totalCombos,
    sup_cands: supCECands.length,
    cond: condCEs.length,
    uncond5: uncond5.length,
    uncond10: uncond10.length,
    uncond0: uncond0.length,
    requiredCEs: reqCEsExt.length,
  });

  if (onProgress) onProgress(0, 0);

  let globalBest = -1;
  let bestInfo: {
    servants: number[];
    ces: number[];
    supportIdx: number;
    supInFront: boolean;
    frontMask: boolean[];
  } | null = null;

  const { baseBond, eventBonusPercent, fixedBonus, teaKettleMultiplier } = params;
  const mainCEs = new Array<number>(5);
  const bonusSums = new Array<number>(servants.length);
  const bonusSumsWithSup = new Array<number>(servants.length);

  for (let ci = 0; ci < ceComboList.length; ci++) {
    const ceCombo = ceComboList[ci];
    // 主力 5 张礼装
    for (let k = 0; k < reqCEsExt.length; k++) mainCEs[k] = reqCEsExt[k];
    for (let k = 0; k < ceCombo.length; k++) mainCEs[reqCEsExt.length + k] = ceCombo[k];

    if (ci % 100 === 0 && onProgress) {
      onProgress(Math.round((ci / totalCombos) * 85), globalBest);
    }

    // ── 计算主力 5 礼装的 bonusSum ──
    bonusSums.fill(0);
    for (const ceIdx of mainCEs) {
      if (ceIdx >= origCELen) continue;
      const bonus = ceBonuses[ceIdx];
      for (const si of availList) {
        if (ceMatch[si][ceIdx]) bonusSums[si] += bonus;
      }
    }

    // 尝试助战在前/后（尊重用户偏好 + 助战从者的前后排偏好）
    let supPositions: boolean[] = params.supportRow === 'auto'
      ? [true, false]
      : [params.supportRow === 'front'];
    // 如果助战从者设了前后排偏好，只允许对应位置
    if (reqSupport !== null) {
      const supPref = params.servantRowPrefs[servants[reqSupport].id];
      if (supPref === 'front') supPositions = supPositions.filter(p => p);
      else if (supPref === 'back') supPositions = supPositions.filter(p => !p);
    }
    for (const supInFront of supPositions) {
      const F = supInFront ? 2 : 3;
      const B = supInFront ? 3 : 2;

      // 预计算所有从者的前后排收益（仅主力5礼装，先选最优从者队伍）
      function mkBond(si: number): CandBond {
        return {
          si,
          front: fastBond(baseBond, bonusSums[si], eventBonusPercent, true, supInFront, fixedBonus, teaKettleMultiplier),
          back: fastBond(baseBond, bonusSums[si], eventBonusPercent, false, supInFront, fixedBonus, teaKettleMultiplier),
        };
      }

      const reqBonds = reqNonSup.map(si => mkBond(si));
      const allFreeBonds = freeServants.map(si => mkBond(si));

      const reqAssignList = enumerateAssignments(reqBonds, F, B, params.servantRowPrefs, servants);

      for (const reqAssign of reqAssignList) {
        const usedF = reqAssign.filter(a => a.isFront).length;
        const usedB = reqAssign.filter(a => !a.isFront).length;
        const remF = F - usedF;
        const remB = B - usedB;
        if (remF < 0 || remB < 0) continue;

        const usedSet = new Set(reqAssign.map(a => a.bond.si));
        const freeCands = allFreeBonds.filter(cb => !usedSet.has(cb.si));

        if (freeCands.length < remF + remB) continue;

        // 计算 CE 总 cost，得出从者预算
        let ceCostTotal = 0;
        for (let k = 0; k < 5; k++) ceCostTotal += craftEssencesExt[mainCEs[k]].cost;
        const maxServantCost = params.maxCost - ceCostTotal;
        if (maxServantCost < 0) continue; // CE 本身已超预算

        const dpResult = pickBestServants(freeCands, remF, remB, maxServantCost, servants);
        if (!dpResult) continue;

        // 汇总非助战从者
        const frontSIs = [
          ...reqAssign.filter(a => a.isFront).map(a => a.bond.si),
          ...dpResult.selected.filter(a => a.isFront).map(a => a.si),
        ];
        const backSIs = [
          ...reqAssign.filter(a => !a.isFront).map(a => a.bond.si),
          ...dpResult.selected.filter(a => !a.isFront).map(a => a.si),
        ];
        const mainSet = new Set([...frontSIs, ...backSIs]);

        // ── 选择最佳助战礼装 ──
        let bestSupCE = -1;
        let bestSupTotal = -1;

        // 如果用户指定了助战礼装，直接使用
        const userSupCE = params.supportCEId
          ? craftEssencesExt.findIndex(c => c.id === params.supportCEId)
          : -1;

        const supCEChoices = userSupCE >= 0 ? [userSupCE] : supCECands;

        for (const supCE of supCEChoices) {
          // 计算加入助战礼装后各从者的 bonusSum
          for (const si of availList) bonusSumsWithSup[si] = bonusSums[si];
          if (supCE >= 0 && supCE < origCELen) {
            const bonus = ceBonuses[supCE];
            for (const si of availList) {
              if (ceMatch[si][supCE]) bonusSumsWithSup[si] += bonus;
            }
          }

          // 重新计算 5 主力从者的羁绊
          let supTotal = 0;
          for (const si of frontSIs) {
            supTotal += fastBond(baseBond, bonusSumsWithSup[si], eventBonusPercent, true, supInFront, fixedBonus, teaKettleMultiplier);
          }
          for (const si of backSIs) {
            supTotal += fastBond(baseBond, bonusSumsWithSup[si], eventBonusPercent, false, supInFront, fixedBonus, teaKettleMultiplier);
          }

          if (supTotal > bestSupTotal) {
            bestSupTotal = supTotal;
            bestSupCE = supCE;
          }
        }

        if (bestSupCE < 0 || bestSupTotal <= globalBest) continue;

        // 防御性 COST 检查（DP 已保证，此处作为安全网）
        let teamCost = 0;
        for (const si of frontSIs) teamCost += servants[si].cost;
        for (const si of backSIs) teamCost += servants[si].cost;
        for (let k = 0; k < 5; k++) teamCost += craftEssencesExt[mainCEs[k]].cost;
        if (teamCost > params.maxCost) continue;

        globalBest = bestSupTotal;

        // 助战从者
        let supSI: number;
        if (reqSupport !== null) {
          supSI = reqSupport;
        } else {
          const found = freeServants.find(s => !mainSet.has(s));
          if (found !== undefined) {
            supSI = found;
          } else {
            continue;
          }
        }

        const allServants = [...frontSIs, ...backSIs, supSI];
        if (new Set(allServants).size !== 6) continue;

        const fullCEs = [...mainCEs, bestSupCE];
        const frontMask = Array(6).fill(false);
        for (let i = 0; i < frontSIs.length; i++) frontMask[i] = true;
        if (supInFront) frontMask[5] = true;

        bestInfo = {
          servants: allServants,
          ces: fullCEs,
          supportIdx: 5,
          supInFront,
          frontMask,
        };
      }
    }
  }

  if (!bestInfo) {
    L('error', '未找到可行解', { totalCombos, globalBest });
    throw new Error('未找到可行解');
  }

  L('info', '精确计算找到最优解', { totalBond: globalBest });
  if (onProgress) onProgress(100, globalBest);

  // 构建结果：将 CE 合理分配给从者
  const { servants: sList, ces: cList, supportIdx, supInFront, frontMask } = bestInfo;
  const cfg: UserParams = { ...params, supportInFrontRow: supInFront };
  const ceObjs = cList.map(i => craftEssencesExt[i]);

  // 将 CE 匹配给最能受益的从者（贪心分配，不影响羁绊计算）
  const assignedCEs = assignCEs(sList, cList, servants, craftEssencesExt);

  const team: TeamSlot[] = sList.map((si, i) => {
    const ceIdx = assignedCEs[i];
    return {
      servant: servants[si],
      craftEssence: craftEssencesExt[ceIdx],
      isSupport: i === supportIdx,
      isFrontRow: frontMask[i],
      bondBreakdown: calculateBond(servants[si], ceObjs, cfg, frontMask[i]),
    };
  });

  const totalBond = team
    .filter(t => !t.isSupport)
    .reduce((s, t) => s + t.bondBreakdown.finalBond, 0);
  const totalCost = team
    .filter(t => !t.isSupport)
    .reduce((s, t) => s + t.servant.cost + t.craftEssence.cost, 0);

  if (totalCost > params.maxCost) {
    L('error', 'COST 异常：结果超过上限', { totalCost, maxCost: params.maxCost });
  }

  return { team, totalBond, totalCost };
}

/** 将 CEs 分配给从者：主力 5 人匹配最佳 CE，助战固定用第 6 张 */
function assignCEs(
  servantIndices: number[],
  ceIndices: number[],
  servants: Servant[],
  craftEssences: CraftEssence[],
): number[] {
  const result = new Array<number>(6).fill(-1);
  // 助战固定用最后一张礼装（第6张）
  result[5] = ceIndices[5];
  const used = new Set<number>();
  // 主力5人：从剩余5张中贪心匹配
  for (let i = 0; i < 5; i++) {
    const si = servantIndices[i];
    let bestCE = -1;
    let bestBonus = -1;
    for (let j = 0; j < 5; j++) {
      const ci = ceIndices[j];
      if (used.has(ci)) continue;
      const ce = craftEssences[ci];
      if (ce.conditions.length === 0) {
        if (ce.bonusPercent > bestBonus) {
          bestBonus = ce.bonusPercent;
          bestCE = ci;
        }
      } else {
        const matches = ce.conditions.some(group =>
          group.length > 0 && group.every(c => servants[si].characteristics.includes(c)),
        );
        if (matches && ce.bonusPercent > bestBonus) {
          bestBonus = ce.bonusPercent;
          bestCE = ci;
        }
      }
    }
    if (bestCE >= 0) {
      result[i] = bestCE;
      used.add(bestCE);
    }
  }
  return result;
}

// ──── 枚举必选从者的前后排分配 ────

function enumerateAssignments(
  bonds: CandBond[],
  maxF: number,
  maxB: number,
  rowPrefs: Record<string, 'front' | 'back'>,
  servants: Servant[],
): { bond: CandBond; isFront: boolean }[][] {
  const results: { bond: CandBond; isFront: boolean }[][] = [];
  const total = bonds.length;

  for (let mask = 0; mask < (1 << total); mask++) {
    const assign: { bond: CandBond; isFront: boolean }[] = [];
    let f = 0, b = 0;
    let ok = true;

    for (let i = 0; i < total; i++) {
      const isFront = (mask & (1 << i)) !== 0;
      // 检查前后排偏好约束
      const sid = servants[bonds[i].si].id;
      const pref = rowPrefs[sid];
      if (pref === 'front' && !isFront) { ok = false; break; }
      if (pref === 'back' && isFront) { ok = false; break; }

      if (isFront) {
        if (f >= maxF) { ok = false; break; }
        f++;
      } else {
        if (b >= maxB) { ok = false; break; }
        b++;
      }
      assign.push({ bond: bonds[i], isFront });
    }

    if (ok) results.push(assign);
  }

  return results;
}
