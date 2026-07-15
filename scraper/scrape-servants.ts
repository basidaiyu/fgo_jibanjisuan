/**
 * Mooncell 从者数据爬虫
 *
 * 运行: npx tsx scraper/scrape-servants.ts
 *
 * 从 mooncell 爬取所有从者的:
 *   - 名称、职介、cost
 *   - 特性标签（秩序、善、所爱之人、騎乗 等）
 *
 * 需要根据实际页面 DOM 调整选择器（见下方 SELECTORS 区域）
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'lib/cheerio' ;

// ========== 配置 ==========
const BASE_URL = 'https://fgo.wiki';
const SERVANT_LIST_URL = `${BASE_URL}/w/英灵图鉴`;
const OUTPUT_PATH = path.resolve(__dirname, '../data/servants.json');
const DELAY_MS = 500; // 请求间延迟，避免被封

// ========== 占位：需根据实际页面 DOM 调整 ==========
// 请用浏览器打开任意从者页面（如 https://fgo.wiki/w/阿斯卡拉福斯）
// 找到对应元素后替换下面的选择器

const SELECTORS = {
  // 从者列表页 -> 每个从者卡片的链接
  servantListLinks: '.servant-list a, .card-list a, table.wikitable tr td:first-child a',
  // 从者详情页 -> 名称 (h1 标题)
  name: '#firstHeading, h1',
  // 从者详情页 -> 职介 (通常在信息栏)
  class: '[data-attr="class"], .class-label, th:contains("职介") + td',
  // 从者详情页 -> cost
  cost: '[data-attr="cost"], th:contains("COST") + td, th:contains("Cost") + td',
  // 从者详情页 -> 特性标签容器
  characteristics: '.characteristic-list a, .trait-list a, th:contains("特性") + td a',
} as const;

// ========== 工具函数 ==========
async function fetchPage(url: string): Promise<cheerio.Root> {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'FGO-Bond-Optimizer/1.0 (research tool)',
    },
    timeout: 15000,
  });
  return cheerio.load(res.data);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ========== 主逻辑 ==========
interface ServantData {
  id: string;
  name: string;
  class: string;
  cost: number;
  characteristics: string[];
}

async function getServantListUrls(): Promise<string[]> {
  console.log(`获取从者列表: ${SERVANT_LIST_URL}`);
  const $ = await fetchPage(SERVANT_LIST_URL);

  const links = new Set<string>();
  $(SELECTORS.servantListLinks).each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.includes('未实装') && !href.includes('未装备')) {
      const fullUrl = href.startsWith('http') ? href : BASE_URL + href;
      links.add(fullUrl);
    }
  });

  console.log(`找到 ${links.size} 个从者链接`);
  return [...links];
}

async function scrapeServant(url: string): Promise<ServantData | null> {
  try {
    const $ = await fetchPage(url);

    const name = $(SELECTORS.name).first().text().trim();
    if (!name) return null;

    // 职介 - 需要根据页面调整提取逻辑
    let className = '';
    $(SELECTORS.class).each((_, el) => {
      const text = $(el).text().trim();
      // 尝试匹配已知职介名
      const matched = text.match(
        /(剣士|弓兵|槍兵|騎兵|術師|殺人鬼|狂戦士|裁決者|復讐者|盾兵|降臨者|月の癌|分離者|詐称者)/,
      );
      if (matched) className = matched[1];
    });

    // cost
    let cost = 0;
    $(SELECTORS.cost).each((_, el) => {
      const text = $(el).text().trim();
      const num = parseInt(text, 10);
      if (!isNaN(num)) cost = num;
    });

    // 特性
    const characteristics: string[] = [];
    $(SELECTORS.characteristics).each((_, el) => {
      const chara = $(el).text().trim();
      if (chara && !characteristics.includes(chara)) {
        characteristics.push(chara);
      }
    });

    const id = 's_' + encodeURIComponent(name);
    console.log(`  ✓ ${name} (${className}) cost:${cost} 特性:${characteristics.length}个`);
    return { id, name, class: className, cost, characteristics };
  } catch (err: any) {
    console.error(`  ✗ 爬取失败: ${url} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Mooncell 从者爬虫 ===\n');

  const urls = await getServantListUrls();
  const results: ServantData[] = [];

  for (let i = 0; i < urls.length; i++) {
    console.log(`[${i + 1}/${urls.length}] ${urls[i]}`);
    const data = await scrapeServant(urls[i]);
    if (data) results.push(data);
    await sleep(DELAY_MS);
  }

  // 确保输出目录存在
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完成! ${results.length} 个从者已写入 ${OUTPUT_PATH}`);
}

main().catch(console.error);
