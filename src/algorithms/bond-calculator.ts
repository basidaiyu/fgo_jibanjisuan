import type { BondBreakdown, UserParams, Servant, CraftEssence } from './types';

/** 判断礼装是否对该从者生效（OR of ANDs，空条件=全部生效） */
export function ceMatchesServant(ce: CraftEssence, servant: Servant): boolean {
  if (ce.conditions.length === 0) return true; // empty outer = all
  return ce.conditions.some((group) => {
    if (group.length === 0) return true; // empty inner = all
    return group.every((c) => servant.characteristics.includes(c));
  });
}

/**
 * 计算单个从者在指定队伍配置下的羁绊收益。
 *
 * 公式：
 *   位置乘区 = 1 + (前排? 0.2 : 0) + (助战在前排? 0.04 : 0)
 *   百分比乘区 = 1 + (所有匹配礼装加成之和 + 活动加成) / 100
 *
 *   中间值1 = floor(基础羁绊 × 位置乘区)
 *   中间值2 = floor(中间值1 × 百分比乘区)
 *   中间值3 = 中间值2 + 固定加成
 *   最终羁绊 = floor(中间值3 × 茶壶倍率)
 */
export function calculateBond(
  servant: Servant,
  allCraftEssences: CraftEssence[],
  params: UserParams,
  isFrontRow: boolean,
): BondBreakdown {
  const positionMultiplier =
    1 + (isFrontRow ? 0.2 : 0) + (params.supportInFrontRow ? 0.04 : 0);

  const matchingBonusSum = allCraftEssences
    .filter((ce) => ceMatchesServant(ce, servant))
    .reduce((sum, ce) => sum + ce.bonusPercent, 0);

  const percentBonusSum = matchingBonusSum + params.eventBonusPercent;
  const percentMultiplier = 1 + percentBonusSum / 100;

  const positionResult = Math.floor(params.baseBond * positionMultiplier);
  const percentResult = Math.floor(positionResult * percentMultiplier);
  const afterFixed = percentResult + params.fixedBonus;
  const finalBond = Math.floor(afterFixed * params.teaKettleMultiplier);

  return {
    baseBond: params.baseBond,
    positionMultiplier,
    positionResult,
    percentBonusSum,
    percentMultiplier,
    percentResult,
    fixedBonus: params.fixedBonus,
    afterFixed,
    teaKettleMultiplier: params.teaKettleMultiplier,
    finalBond,
  };
}

/**
 * 已知所有礼装，批量计算队伍中每个从者的羁绊。
 */
export function calculateTeamBond(
  team: { servant: Servant; isFrontRow: boolean }[],
  allCraftEssences: CraftEssence[],
  params: UserParams,
): { totalBond: number; breakdowns: BondBreakdown[] } {
  const breakdowns = team.map(({ servant, isFrontRow }) =>
    calculateBond(servant, allCraftEssences, params, isFrontRow),
  );
  const totalBond = breakdowns.reduce((sum, b) => sum + b.finalBond, 0);
  return { totalBond, breakdowns };
}
