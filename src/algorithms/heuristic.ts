import type { UserParams, OptimizationResult, TeamSlot, Logger, CraftEssence } from './types';
import { calculateBond } from './bond-calculator';
import type { PrecomputedData } from './precompute';

/**
 * 贪心 + 局部搜索快速算法。
 *
 * 1. 贪心构造初始解（多轮，选最优）
 * 2. 2-opt 局部搜索（交换从者/礼装）
 * 3. 最终评估位置排列
 */
export function heuristicOptimize(
  pre: PrecomputedData,
  params: UserParams,
  onProgress?: (percent: number, currentBest: number) => void,
  log?: Logger,
): OptimizationResult {
  const { servants, craftEssences } = pre;
  const m = craftEssences.length;
  const L = log ?? (() => {});

  L('info', '启发式计算开始', { servants: servants.length, ces: m });

  // 过滤可用从者
  const availableIndices = servants
    .map((_, i) => i)
    .filter((i) => {
      const s = servants[i];
      if (params.excludedServantIds.includes(s.id)) return false;
      if (params.allowedClasses.length > 0 && !params.allowedClasses.includes(s.class)) return false;
      return true;
    });

  // 必选从者
  const requiredSI = params.requiredServantIds
    .map(id => servants.findIndex(s => s.id === id))
    .filter(i => i >= 0 && availableIndices.includes(i));

  if (requiredSI.length > 5) {
    throw new Error(`必选从者不能超过5人`);
  }

  // 当必选满5人时，第5人作为助战（与精确算法一致）
  const reqSupport = requiredSI.length === 5 ? requiredSI[4] : null;
  const reqNonSup = reqSupport !== null ? requiredSI.slice(0, 4) : requiredSI;

  if (availableIndices.length < 6 - reqNonSup.length) {
    L('error', '可用从者不足', { available: availableIndices.length, required: reqNonSup.length });
    throw new Error(`可用从者不足 (需要${6 - reqNonSup.length}人，当前${availableIndices.length - reqNonSup.length}人可用)`);
  }

  L('debug', '从者筛选完成', { available: availableIndices.length, required: requiredSI.length, excluded: params.excludedServantIds.length });

  let availableSet = new Set(availableIndices);

  // 预排序从者（按 cost 升序），用于动态计算最低剩余成本
  const servantsByCost = [...availableIndices].sort((a, b) => servants[a].cost - servants[b].cost);

  /** 计算未被使用的从者中最便宜的 count 个的总 cost */
  function cheapestN(used: Set<number>, count: number): number {
    if (count <= 0) return 0;
    let total = 0;
    let found = 0;
    for (const si of servantsByCost) {
      if (!used.has(si)) {
        total += servants[si].cost;
        found++;
        if (found >= count) return total;
      }
    }
    return Infinity;
  }

  // 过滤可用礼装
  const availableCEs = craftEssences
    .map((_, i) => i)
    .filter(i => !params.excludedCEIds.includes(craftEssences[i].id));

  const requiredCEs = params.requiredCEIds
    .map(id => craftEssences.findIndex(c => c.id === id))
    .filter(i => i >= 0 && availableCEs.includes(i));

  // 无礼装时的兜底：索引 -1 表示"空礼装"（0%加成，0 cost）
  const NO_CE = -1;
  const dummyCE = { id: '__dummy__', name: '无礼装', cost: 0, bonusPercent: 0, conditions: [] as string[][] };
  const getCE = (ci: number): CraftEssence => ci === NO_CE ? dummyCE as CraftEssence : craftEssences[ci];
  const getCEObjs = (indices: number[]): CraftEssence[] => indices.map(getCE);

  /** 计算边际收益：在当前队伍中新增 (si, ci) 的额外羁绊 */
  function marginalGain(
    si: number,
    ci: number,
    currentServants: number[],
    currentCEs: number[],
  ): number {
    const newCEObjs = [...getCEObjs(currentCEs), getCE(ci)];
    const newServants = [...currentServants, si];
    const isFull = newServants.length === 6;
    let total = 0;
    for (let i = 0; i < newServants.length; i++) {
      // 助战（位置5）的羁绊不计入最终结果，贪心选择时也不应计入
      if (isFull && i === 5) continue;
      const isFront = i < 3 || (i === newServants.length - 1 && newServants.length <= 3);
      const configParams: UserParams = { ...params, supportInFrontRow: true };
      total += calculateBond(
        servants[newServants[i]],
        newCEObjs,
        configParams,
        isFront,
      ).finalBond;
    }
    return total;
  }

  /** 计算队伍非助战从者+礼装的总 COST */
  function teamCost(servantIndices: number[], ceIndices: number[]): number {
    let c = 0;
    for (let i = 0; i < 5; i++) {
      c += servants[servantIndices[i]].cost + getCE(ceIndices[i]).cost;
    }
    return c;
  }

  /** 贪心构造一个解 */
  function greedyConstruct(): { servantIndices: number[]; ceIndices: number[] } | null {
    const selectedServants: number[] = [...reqNonSup];
    const selectedCEs: number[] = [...requiredCEs];
    const usedServants = new Set<number>(reqNonSup);
    const usedCEs = new Set<number>(requiredCEs);

    // 必选助战（第5个必选从者）
    if (reqSupport !== null) {
      usedServants.add(reqSupport);
    }

    // 预先查找用户指定的助战礼装索引
    const userSupCE = params.supportCEId
      ? craftEssences.findIndex(c => c.id === params.supportCEId)
      : -1;

    // 追踪当前已消耗的 COST（仅非助战位置）
    let currentCost = 0;
    for (let i = 0; i < reqNonSup.length; i++) {
      currentCost += servants[reqNonSup[i]].cost + getCE(requiredCEs[i] ?? NO_CE).cost;
    }

    for (let slot = reqNonSup.length; slot < 6; slot++) {
      const isSupport = slot === 5;
      // 如果有预定的助战从者
      if (isSupport && reqSupport !== null) {
        // 用户指定了助战礼装则直接使用，否则贪心选择最优
        const supCE = userSupCE >= 0 ? userSupCE : (() => {
          let bestCI = NO_CE;
          let bestGain = -1;
          const cePool = availableCEs.length > 0 ? [...availableCEs] : [NO_CE];
          for (const uci of usedCEs) {
            if (uci !== NO_CE && !cePool.includes(uci) && availableCEs.includes(uci)) {
              cePool.push(uci);
            }
          }
          for (const ci of cePool.slice(0, 30)) {
            const gain = marginalGain(reqSupport, ci, selectedServants, selectedCEs);
            if (gain > bestGain) { bestGain = gain; bestCI = ci; }
          }
          return bestCI;
        })();
        selectedServants.push(reqSupport);
        selectedCEs.push(supCE);
        continue;
      }

      let bestGain = -1;
      let bestSI = -1;
      let bestCI = -1;

      // 动态计算剩余 slot 的最低从者 cost（排除已使用的从者）
      const remainingNonSupportSlots = 4 - slot;
      const minRemainingServant = cheapestN(usedServants, remainingNonSupportSlots);

      // 随机探索部分候选（提速）
      const candidates = [...availableSet].filter((s) => !usedServants.has(s));
      const sampleSize = slot < 3 ? candidates.length : Math.min(candidates.length, 50);

      for (let t = 0; t < sampleSize; t++) {
        const si = candidates[t < candidates.length ? t : Math.floor(Math.random() * candidates.length)];
        if (usedServants.has(si)) continue;

        // 为该从者选择最优礼装
        // 助战位置如果用户指定了礼装，直接使用
        if (isSupport && userSupCE >= 0) {
          const gain = marginalGain(si, userSupCE, selectedServants, selectedCEs);
          if (gain > bestGain) {
            bestGain = gain;
            bestSI = si;
            bestCI = userSupCE;
          }
          continue;
        }

        // 助战位置：礼装可复用已选礼装（不检查 usedCEs）
        let cePool: number[];
        if (isSupport) {
          // 助战可从所有可用礼装中任选（含已用的，即允许重复）
          cePool = availableCEs.length > 0 ? availableCEs : [NO_CE];
          // 补充已用过的条件礼装（它们可能比无条件礼装加成高）
          for (const uci of usedCEs) {
            if (uci !== NO_CE && !cePool.includes(uci) && availableCEs.includes(uci)) {
              cePool.push(uci);
            }
          }
        } else {
          const matchingCEs = pre.servantCEMap[si]
            .filter((ci) => ci === NO_CE || (!usedCEs.has(ci) && availableCEs.includes(ci)));
          cePool = matchingCEs.length > 0 ? matchingCEs
            : availableCEs.filter((ci) => ci === NO_CE || !usedCEs.has(ci));
          if (cePool.length === 0) cePool = [NO_CE];
        }

        for (const ci of cePool.slice(0, 30)) {
          if (!isSupport && ci !== NO_CE && usedCEs.has(ci)) continue;

          // COST 剪枝：非助战位置用动态最低剩余从者成本
          if (!isSupport) {
            const slotCost = servants[si].cost + getCE(ci).cost;
            if (currentCost + slotCost + minRemainingServant > params.maxCost) continue;
          }

          const gain = marginalGain(si, ci, selectedServants, selectedCEs);
          if (gain > bestGain) {
            bestGain = gain;
            bestSI = si;
            bestCI = ci;
          }
        }
      }

      if (bestSI === -1) return null;

      selectedServants.push(bestSI);
      selectedCEs.push(bestCI);
      usedServants.add(bestSI);
      // 助战礼装可重复，不计入 usedCEs
      if (!isSupport && bestCI !== NO_CE) usedCEs.add(bestCI);
      // 更新已消耗 COST（仅非助战位置）
      if (!isSupport) {
        currentCost += servants[bestSI].cost + getCE(bestCI).cost;
      }
    }

    return { servantIndices: selectedServants, ceIndices: selectedCEs };
  }

  /** 评估完整队伍的羁绊 */
  function evaluateFullTeam(
    servantIndices: number[],
    ceIndices: number[],
  ): { totalBond: number; frontMask: boolean[]; supportInFront: boolean } {
    const ceObjs = getCEObjs(ceIndices);
    let bestBond = -1;
    let bestFrontMask: boolean[] = [];
    let bestSupportInFront = false;

    // 预计算前后排约束
    const rowPrefs: (boolean | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const sid = servants[servantIndices[i]].id;
      const p = params.servantRowPrefs[sid];
      rowPrefs.push(p === 'front' ? true : p === 'back' ? false : null);
    }
    const validFrontSet = (fs: Set<number>) => {
      for (let i = 0; i < 5; i++) {
        if (rowPrefs[i] === true && !fs.has(i)) return false;
        if (rowPrefs[i] === false && fs.has(i)) return false;
      }
      return true;
    };

    let supPositions: boolean[] = params.supportRow === 'auto'
      ? [true, false]
      : [params.supportRow === 'front'];
    // 检查助战从者的前后排偏好
    const supId = servants[servantIndices[5]].id;
    const supPref = params.servantRowPrefs[supId];
    if (supPref === 'front') supPositions = supPositions.filter(p => p);
    else if (supPref === 'back') supPositions = supPositions.filter(p => !p);

    for (const supportInFront of supPositions) {
      const frontCount = supportInFront ? 2 : 3;
      const nonSupport = [0, 1, 2, 3, 4];
      for (let a = 0; a < nonSupport.length; a++) {
        for (let b = a + 1; b < nonSupport.length; b++) {
          const frontSet = new Set(frontCount >= 2 ? [nonSupport[a], nonSupport[b]] : []);
          if (frontCount >= 3) {
            for (let c = b + 1; c < nonSupport.length; c++) {
              frontSet.add(nonSupport[c]);
              if (!validFrontSet(frontSet)) { frontSet.delete(nonSupport[c]); continue; }
              const mask = servantIndices.map(
                (_, i) => frontSet.has(i) || (supportInFront && i === 5),
              );
              let total = 0;
              const cfg: UserParams = { ...params, supportInFrontRow: supportInFront };
              for (let i = 0; i < 6; i++) {
                if (i === 5) continue;
                total += calculateBond(servants[servantIndices[i]], ceObjs, cfg, mask[i]).finalBond;
              }
              if (total > bestBond) {
                bestBond = total;
                bestFrontMask = mask;
                bestSupportInFront = supportInFront;
              }
              frontSet.delete(nonSupport[c]);
            }
          } else {
            if (!validFrontSet(frontSet)) continue;
            const mask = servantIndices.map(
              (_, i) => frontSet.has(i) || (supportInFront && i === 5),
            );
            let total = 0;
            const cfg: UserParams = { ...params, supportInFrontRow: supportInFront };
            for (let i = 0; i < 6; i++) {
              if (i === 5) continue;
              total += calculateBond(servants[servantIndices[i]], ceObjs, cfg, mask[i]).finalBond;
            }
            if (total > bestBond) {
              bestBond = total;
              bestFrontMask = mask;
              bestSupportInFront = supportInFront;
            }
          }
        }
      }
    }
    return { totalBond: bestBond, frontMask: bestFrontMask, supportInFront: bestSupportInFront };
  }

  // 多轮贪心
  const numRestarts = 10;
  let bestServants: number[] = [];
  let bestCEs: number[] = [];
  let bestBond = -1;
  let totalSteps = 0;
  const estimatedSteps = numRestarts * (1 + 200 * 2); // greedy + local search estimate

  function reportProgress(step: number) {
    if (!onProgress) return;
    const basePct = Math.round((step / estimatedSteps) * 92); // 0-92% for search, reserve 93-100% for final
    onProgress(Math.min(92, basePct), bestBond);
  }

  if (onProgress) onProgress(0, 0);

  for (let round = 0; round < numRestarts; round++) {
    totalSteps++;
    if (totalSteps % 2 === 0) reportProgress(totalSteps);

    // 随机扰动可用从者顺序（影响贪心构造的候选顺序）
    if (round > 0) {
      const arr = [...availableIndices];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      availableSet = new Set(arr);
    }

    const init = greedyConstruct();
    if (!init) continue;
    if (teamCost(init.servantIndices, init.ceIndices) > params.maxCost) continue;

    // 局部搜索
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 200) {
      improved = false;
      iterations++;
      totalSteps++;
      if (totalSteps % 2 === 0) reportProgress(totalSteps);

      // 尝试交换两个从者
      for (let i = 0; i < 5 && !improved; i++) {
        const origBond = evaluateFullTeam(init.servantIndices, init.ceIndices).totalBond;
        for (const newSI of availableIndices) {
          if (init.servantIndices.includes(newSI)) continue;
          const orig = init.servantIndices[i];
          // COST 检查
          if (teamCost(init.servantIndices.map((s, idx) => idx === i ? newSI : s), init.ceIndices) > params.maxCost) continue;
          init.servantIndices[i] = newSI;
          const { totalBond } = evaluateFullTeam(init.servantIndices, init.ceIndices);
          if (totalBond > origBond) {
            improved = true;
            break;
          }
          init.servantIndices[i] = orig;
        }
      }

      // 尝试交换两个礼装
      if (!improved) {
        for (let i = 0; i < 6 && !improved; i++) {
          const isSupport = i === 5;
          const origBond = evaluateFullTeam(init.servantIndices, init.ceIndices).totalBond;
          for (let ci = 0; ci < m && !improved; ci++) {
            // 助战礼装可重复，不检查重复
            if (!isSupport && init.ceIndices.includes(ci)) continue;
            const orig = init.ceIndices[i];
            // COST 检查（仅非助战位置）
            if (!isSupport && teamCost(init.servantIndices, init.ceIndices.map((c, idx) => idx === i ? ci : c)) > params.maxCost) continue;
            init.ceIndices[i] = ci;
            const { totalBond: newBond } = evaluateFullTeam(init.servantIndices, init.ceIndices);
            if (newBond > origBond) {
              improved = true;
              break;
            }
            init.ceIndices[i] = orig;
          }
        }
      }
    }

    const { totalBond } = evaluateFullTeam(init.servantIndices, init.ceIndices);
    if (totalBond > bestBond) {
      bestBond = totalBond;
      bestServants = [...init.servantIndices];
      bestCEs = [...init.ceIndices];
    }
    if (onProgress) {
      onProgress(92 + Math.round(((round + 1) / numRestarts) * 8), bestBond);
    }
  }

  if (bestServants.length === 0) {
    L('error', '启发式未找到可行解', { rounds: numRestarts });
    throw new Error('未找到可行解');
  }

  L('info', '启发式找到最优解', { totalBond: bestBond, rounds: numRestarts });

  const { frontMask, supportInFront } = evaluateFullTeam(bestServants, bestCEs);

  const result = buildResult(
    bestServants, bestCEs, frontMask, supportInFront, pre, params,
  );
  L('debug', '队伍详情', {
    servants: result.team.map(t => t.servant.name),
    ces: result.team.map(t => t.craftEssence.name),
    totalBond: result.totalBond,
    totalCost: result.totalCost,
  });
  return result;
}

function buildResult(
  servantIndices: number[],
  ceIndices: number[],
  frontMask: boolean[],
  supportInFront: boolean,
  pre: PrecomputedData,
  params: UserParams,
): OptimizationResult {
  const NO_CE_CACHE: CraftEssence = { id: '__no_ce__', name: '无礼装', cost: 0, bonusPercent: 0, conditions: [] };
  const getCe = (ci: number) => ci < 0 ? NO_CE_CACHE : pre.craftEssences[ci];
  const ceObjs = ceIndices.map(getCe);
  const cfg: UserParams = { ...params, supportInFrontRow: supportInFront };
  const team: TeamSlot[] = servantIndices.map((si, i) => ({
    servant: pre.servants[si],
    craftEssence: getCe(ceIndices[i]),
    isSupport: i === 5,
    isFrontRow: frontMask[i],
    bondBreakdown: calculateBond(pre.servants[si], ceObjs, cfg, frontMask[i]),
  }));

  const totalBond = team
    .filter((t) => !t.isSupport)
    .reduce((s, t) => s + t.bondBreakdown.finalBond, 0);
  const totalCost = team
    .filter((t) => !t.isSupport)
    .reduce((s, t) => s + t.servant.cost + t.craftEssence.cost, 0);

  if (totalCost > params.maxCost) {
    console.warn('[heuristic] COST 异常：结果超过上限', { totalCost, maxCost: params.maxCost });
  }

  return { team, totalBond, totalCost };
}
