/**
 * Mooncell 礼装数据爬虫
 *
 * 运行: npx tsx scraper/scrape-ces.ts
 *
 * 从礼装图鉴页面爬取:
 *   - 筛选: 5星 + 达芬奇工坊 + 最大解放
 *   - 名称、cost、加成百分比、加成条件（映射到特性名）
 *
 * 需要根据实际页面 DOM 调整选择器（见下方 SELECTORS 区域）
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'lib/cheerio' ;

// ========== 配置 ==========
const BASE_URL = 'https://fgo.wiki';
const CE_LIST_URL = `${BASE_URL}/w/礼装图鉴`;
const OUTPUT_PATH = path.resolve(__dirname, '../data/craft-essences.json');
const DELAY_MS = 500;

// ========== 占位：需根据实际页面 DOM 调整 ==========
// 礼装图鉴页面有筛选器，需要选择:
//   星级: 5星
//   来源: 达芬奇工坊 (或类似筛选)
//   突破: 最大解放
//
// 然后遍历结果列表，解析每个礼装的:
//   名称、cost、加成数值、加成条件特性

const SELECTORS = {
  // 礼装列表中的每个条目链接
  ceListLinks: '.ce-list a, .card-list a, table.wikitable tr td:first-child a',
  // 礼装详情页
  name: '#firstHeading, h1',
  cost: '[data-attr="cost"], th:contains("COST") + td, th:contains("Cost") + td',
  // 满破加成数值 (百分比)
  maxBonus: '.max-limit-bonus, th:contains("最大解放") + td, .max-bond-bonus',
  // 加成条件 / 对应特性
  bonusCondition: '.bonus-condition, th:contains("条件") + td, .ce-condition',
} as const;

// ========== 工具函数 ==========
async function fetchPage(url: string): Promise<cheerio.Root> {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'FGO-Bond-Optimizer/1.0 (research tool)' },
    timeout: 15000,
  });
  return cheerio.load(res.data);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ========== 主逻辑 ==========
interface CEData {
  id: string;
  name: string;
  cost: number;
  bonusPercent: number;
  condition: string;
}

async function getCEListUrls(): Promise<string[]> {
  console.log(`获取礼装列表: ${CE_LIST_URL}`);
  // 注: 实际页面可能需要添加查询参数来筛选
  // 如 ?star=5&source=davinci&limit=1
  const $ = await fetchPage(CE_LIST_URL);

  const links = new Set<string>();
  $(SELECTORS.ceListLinks).each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/w/')) {
      const fullUrl = href.startsWith('http') ? href : BASE_URL + href;
      // 排除从者页面（共享图鉴链接结构）
      if (!fullUrl.includes('英灵') && !fullUrl.includes('从者')) {
        links.add(fullUrl);
      }
    }
  });

  console.log(`找到 ${links.size} 个礼装链接`);
  return [...links];
}

async function scrapeCE(url: string): Promise<CEData | null> {
  try {
    const $ = await fetchPage(url);

    const name = $(SELECTORS.name).first().text().trim();
    if (!name) return null;

    let cost = 0;
    $(SELECTORS.cost).each((_, el) => {
      const num = parseInt($(el).text().trim(), 10);
      if (!isNaN(num)) cost = num;
    });

    let bonusPercent = 0;
    $(SELECTORS.maxBonus).each((_, el) => {
      const text = $(el).text().trim();
      const matched = text.match(/(\d+)\s*%/);
      if (matched) bonusPercent = parseInt(matched[1], 10);
    });

    let condition = '';
    $(SELECTORS.bonusCondition).each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 50) condition = text;
    });

    // 如果没有匹配到 condition，尝试从名称推断
    if (!condition) {
      // 常见模式: "XXの絆" → 特性是 "XX"
    }

    const id = 'ce_' + encodeURIComponent(name);
    console.log(`  ✓ ${name} cost:${cost} +${bonusPercent}% 条件:${condition}`);
    return { id, name, cost, bonusPercent, condition };
  } catch (err: any) {
    console.error(`  ✗ 爬取失败: ${url} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Mooncell 礼装爬虫 ===\n');

  const urls = await getCEListUrls();
  const results: CEData[] = [];

  for (let i = 0; i < urls.length; i++) {
    console.log(`[${i + 1}/${urls.length}] ${urls[i]}`);
    const data = await scrapeCE(urls[i]);
    if (data) results.push(data);
    await sleep(DELAY_MS);
  }

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完成! ${results.length} 件礼装已写入 ${OUTPUT_PATH}`);
}

main().catch(console.error);
