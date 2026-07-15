// ========== 基础数据模型 ==========

export interface Servant {
  id: string;
  name: string;
  class: string;
  cost: number;
  characteristics: string[];
  imageUrl?: string;
}

export interface CraftEssence {
  id: string;
  name: string;
  cost: number;
  bonusPercent: number;
  /**
   * 匹配条件：外层 OR，内层 AND
   * - [] 或 [[]] = 匹配全部从者
   * - [["秩序","善"]] = 秩序 AND 善
   * - [["星"],["恶"]] = 星 OR 恶
   */
  conditions: string[][];
  imageUrl?: string;
}

// ========== 用户输入参数 ==========

export interface UserParams {
  baseBond: number;
  teaKettleMultiplier: number;   // 1, 2, or 3
  eventBonusPercent: number;     // 活动加成百分比
  fixedBonus: number;            // 固定加成（如牵绊肖像的 50 点）
  supportInFrontRow: boolean;    // 助战是否在前排（算法运行时使用）
  supportRow: 'auto' | 'front' | 'back';  // 用户偏好：自动/强制前/强制后
  excludedServantIds: string[];  // 排除的从者
  requiredServantIds: string[];  // 必选的从者（必须入队）
  servantRowPrefs: Record<string, 'front' | 'back'>;  // 必选从者的前后排偏好
  allowedClasses: string[];      // 空 = 全部允许
  requiredCEIds: string[];       // 必选的礼装
  excludedCEIds: string[];       // 排除的礼装
  supportCEId: string | null;    // 助战礼装（null = 自动选择最优）
  maxCost: number;               // 队伍 COST 上限
}

// ========== 队伍 & 计算结果 ==========

export interface BondBreakdown {
  baseBond: number;
  positionMultiplier: number;
  positionResult: number;
  percentBonusSum: number;
  percentMultiplier: number;
  percentResult: number;
  fixedBonus: number;
  afterFixed: number;
  teaKettleMultiplier: number;
  finalBond: number;
}

export interface TeamSlot {
  servant: Servant;
  craftEssence: CraftEssence;
  isSupport: boolean;
  isFrontRow: boolean;
  bondBreakdown: BondBreakdown;
}

export interface OptimizationResult {
  team: TeamSlot[];
  totalBond: number;
  totalCost: number;
}

// ========== 算法配置 ==========

export type AlgorithmMode = 'exact' | 'heuristic';

export interface ComputeRequest {
  servants: Servant[];
  craftEssences: CraftEssence[];
  params: UserParams;
  mode: AlgorithmMode;
}

export interface ComputeProgress {
  type: 'progress';
  percent: number;
  currentBest: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type Logger = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

export interface ComputeLog {
  type: 'log';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export type ComputeMessage = ComputeProgress | ComputeLog | { type: 'done'; result: OptimizationResult };
