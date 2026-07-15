/**
 * Mooncell 完整数据爬虫
 *
 * 用法: node scraper/scrape-all.mjs
 *
 * 从 fgo.wiki 爬取:
 *   1. 全部从者（名称、职介、cost、特性、头像URL）
 *   2. 羁绊加成礼装（5星达芬奇工坊，满破数值）
 *   3. 下载从者头像和礼装图标
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const IMG_DIR = path.resolve(__dirname, '../public/img');

const API = 'https://fgo.wiki/api.php';
const DELAY = 200; // ms between requests
const BATCH_SIZE = 50;

// ========== Helpers ==========

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ========== Servant Scraper ==========

/**
 * Paginate through all category members.
 */
async function getAllCategoryMembers(categoryName) {
  const titles = [];
  let cmcontinue = undefined;

  do {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: categoryName,
      cmlimit: 'max',
      cmtype: 'page',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;

    const data = await api(params);
    for (const m of data.query.categorymembers) {
      titles.push(m.title);
    }
    cmcontinue = data.continue?.cmcontinue;
    await sleep(DELAY);
  } while (cmcontinue);

  return titles;
}

/**
 * Parse {{基础数值}} template from wikitext.
 *
 * Example wikitext fields:
 *   |中文名=阿尔托莉雅·潘德拉贡
 *   |稀有度=5
 *   |职阶=Saber
 *   |属性1=秩序
 *   |属性2=善
 *   |副属性=地
 *   |特性1=骑乘
 *   |特性2=龙
 *   |特性3=阿尔托莉雅脸
 *   ...
 *   |文件1=阿尔托莉雅-卡面1
 *   |文件4=阿尔托莉雅-卡面4
 */
// 职介英文 → 中文映射
const CLASS_MAP = {
  Saber: '剣士', Archer: '弓兵', Lancer: '槍兵', Rider: '騎兵',
  Caster: '術師', Assassin: '殺人鬼', Berserker: '狂戦士',
  Ruler: '裁決者', Avenger: '復讐者', MoonCancer: '月の癌',
  AlterEgo: '分離者', Foreigner: '降臨者', Pretender: '詐称者',
  Shielder: '盾兵', Beast: '獣',
};

function parseServantTemplate(wikitext) {
  // Extract the {{基础数值}} block (ends with }}\n==)
  const start = wikitext.indexOf('{{基础数值');
  if (start < 0) return null;
  const end = wikitext.indexOf('}}\n==', start);
  if (end < 0) return null;
  const block = wikitext.substring(start, end + 2);

  const get = (key) => {
    const re = new RegExp(`\\|${key}\\s*=\\s*(.+)`, 'm');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  const name = get('中文名') || get('中文战斗名');
  const rarity = parseInt(get('稀有度')) || 0;
  const classNameRaw = get('职阶');
  const className = CLASS_MAP[classNameRaw] || classNameRaw;
  const attr1 = get('属性1');
  const attr2 = get('属性2');
  const subAttr = get('副属性');

  // Rarity → default cost
  const rarityToCost = { 0: 0, 1: 3, 2: 4, 3: 7, 4: 12, 5: 16 };
  const cost = rarityToCost[rarity] ?? 0;

  // Collect characteristics
  const chars = [];
  if (attr1) chars.push(attr1);
  if (attr2) chars.push(attr2);
  if (subAttr) chars.push(subAttr);

  // 特性1 ~ 特性N
  for (let i = 1; i <= 30; i++) {
    const ch = get(`特性${i}`);
    if (ch) chars.push(ch);
  }

  // 人型
  const humanoid = get('人型');
  if (humanoid === '是') chars.push('人型');

  // 性别
  const gender = get('性别');
  if (gender === '女性') chars.push('女性');
  if (gender === '男性') chars.push('男性');

  // 职介本身也是可匹配特性
  if (className) chars.push(className);

  // 特殊：七骑士 = 基础七职
  const KNIGHT_CLASSES = ['剣士','弓兵','槍兵','騎兵','術師','殺人鬼','狂戦士'];
  if (KNIGHT_CLASSES.includes(className)) chars.push('七骑士');

  // Image
  const imgFile1 = get('文件1');
  const imgFile4 = get('文件4');

  return {
    name,
    class: className,
    cost,
    rarity,
    characteristics: [...new Set(chars)],
    imgFile1: imgFile1 || '',
    imgFile4: imgFile4 || '',
  };
}

async function scrapeAllServants() {
  console.log('=== 爬取从者数据 ===\n');

  // Get all servant page titles
  console.log('获取从者列表...');
  const titles = await getAllCategoryMembers('Category:英灵图鉴');
  console.log(`找到 ${titles.length} 个从者页面\n`);

  const results = [];
  // Process in batches
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);

    // Fetch wikitext for each page in the batch
    for (const title of batch) {
      try {
        const data = await api({
          action: 'parse',
          page: title,
          prop: 'wikitext',
        });
        const wikitext = data.parse?.wikitext?.['*'];
        if (!wikitext) {
          console.log(`  ✗ ${title}: 无 wikitext`);
          continue;
        }

        const parsed = parseServantTemplate(wikitext);
        if (!parsed) {
          console.log(`  ✗ ${title}: 解析失败`);
          continue;
        }

        const id = 's_' + encodeURIComponent(parsed.name);
        results.push({
          id,
          name: parsed.name,
          class: parsed.class,
          cost: parsed.cost,
          characteristics: parsed.characteristics,
          imgFile: parsed.imgFile4 || parsed.imgFile1,
        });
        console.log(`  ✓ ${parsed.name} (${parsed.class}) cost:${parsed.cost} 特性:${parsed.characteristics.length}个`);
      } catch (err) {
        console.log(`  ✗ ${title}: ${err.message}`);
      }
      await sleep(DELAY);
    }
    console.log(`  进度: ${Math.min(i + BATCH_SIZE, titles.length)}/${titles.length}`);
  }

  // Save
  const outPath = path.join(DATA_DIR, 'servants.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完成! ${results.length} 个从者 → ${outPath}`);
  return results;
}

// ========== CE Scraper ==========

/**
 * Parse {{概念礼装}} template for bond CEs.
 *
 * We're looking for CEs with bond-increasing effects.
 * These typically have:
 *   |效果=牵绊点获得量增加X%
 *   or similar bond-related effect text.
 */
function parseCEInfo(wikitext, title) {
  // Extract the {{概念礼装}} template block (handle nested {{...}})
  const start = wikitext.indexOf('{{概念礼装');
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext.substring(i, i + 2) === '{{') depth++;
    else if (wikitext.substring(i, i + 2) === '}}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const block = wikitext.substring(start, end + 2);

  const get = (key) => {
    const re = new RegExp('\\|' + key + '\\s*=\\s*([\\s\\S]*?)(?=\\n\\||\\}\\}$)', 'm');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  const name = get('名称') || get('中文名') || title;
  const rarity = parseInt(get('稀有度')) || 0;
  const cost = parseInt(get('cost')) || 0;
  const classification = get('礼装分类');
  const effect = get('持有技能'); // The bond effect text

  // Must have bond effect text
  if (!effect.includes('牵绊') && !effect.includes('羁绊')) return null;

  // Only 5-star
  if (rarity !== 5) return null;

  // Extract max limit broken percentage (the number before % and before [最大解放])
  const mlbMatch = effect.match(/(\d+)%[^\n]*\[最大解放\]/);
  const bonusPercent = mlbMatch ? parseInt(mlbMatch[1]) : 0;

  // Skip if no MLB value found
  if (bonusPercent === 0) return null;

  // Extract conditions from {{特攻|...}} templates
  // Each {{特攻}} = one OR group. Within a group, "且"/"·" = AND.
  const orGroups = [];
  const teikouRe = /\{\{特攻\|([^}]+)\}\}/g;
  let tm;
  while ((tm = teikouRe.exec(effect)) !== null) {
    const inner = tm[1];
    const parts = inner.split('|');
    const positional = parts.filter(p => !p.includes('='));
    const traitText = positional[positional.length - 1] || positional[0] || '';
    const cleaned = traitText.replace(/[〔〕]/g, '');
    if (!cleaned) continue;

    // Parse AND conditions within this group
    const andGroup = [];
    if (cleaned.includes('且')) {
      for (const t of cleaned.split('且')) {
        const mapped = CLASS_MAP[t.trim()] || t.trim();
        andGroup.push(mapped);
      }
    } else if (cleaned.includes('·')) {
      for (const t of cleaned.split('·')) {
        const mapped = CLASS_MAP[t.trim()] || t.trim();
        andGroup.push(mapped);
      }
    } else {
      const mapped = CLASS_MAP[cleaned.trim()] || cleaned.trim();
      andGroup.push(mapped);
    }
    orGroups.push(andGroup);
  }

  // Clean up each OR group
  const SPECIAL_MAP = { '兽科从者': '兽科', '拥有星之力的从者': '星' };
  const cleanedGroups = [];
  for (const group of orGroups) {
    const cleaned = [];
    for (let c of group) {
      c = c.replace(/\(.*\)/, '').trim();
      if (c.includes('的女性')) { cleaned.push(c.replace('的女性','').trim(), '女性'); continue; }
      if (c.includes('的男性')) { cleaned.push(c.replace('的男性','').trim(), '男性'); continue; }
      cleaned.push(SPECIAL_MAP[c] || c);
    }
    // Deduplicate within group
    const unique = [...new Set(cleaned)];
    if (unique.length > 0) cleanedGroups.push(unique);
  }

  // Deduplicate OR groups (serialize for comparison)
  const seen = new Set();
  const uniqueGroups = cleanedGroups.filter(g => {
    const key = g.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // If no conditions found, this CE applies to ALL servants
  const imgFile = get('图片名') || get('文件1') || '';

  return {
    name,
    rarity,
    cost,
    bonusPercent,
    conditions: uniqueGroups,
    classification,
    imgFile,
  };
}

async function scrapeBondCEs() {
  console.log('\n=== 爬取羁绊礼装数据 ===\n');

  // Get Da Vinci workshop CE titles (魔力棱镜兑换)
  console.log('获取达芬奇工坊礼装列表...');
  const titles = await getAllCategoryMembers('Category:魔力棱镜兑换概念礼装');
  console.log(`找到 ${titles.length} 个达芬奇工坊礼装\n`);

  const results = [];
  let processed = 0;

  for (const title of titles) {
    try {
      const data = await api({
        action: 'parse',
        page: title,
        prop: 'wikitext',
      });
      const wikitext = data.parse?.wikitext?.['*'];
      if (!wikitext) continue;

      const parsed = parseCEInfo(wikitext, title);
      processed++;
      if (!parsed) continue;

      // Filter: 5-star CEs
      if (parsed.rarity !== 5) continue;

      const id = 'ce_' + encodeURIComponent(parsed.name);
      results.push({
        id,
        name: parsed.name,
        cost: parsed.cost,
        bonusPercent: parsed.bonusPercent,
        conditions: parsed.conditions,
        imgFile: parsed.imgFile,
      });
      const condDesc = parsed.conditions.length === 0 ? '全部' :
        parsed.conditions.map(g => g.join('+')).join(' OR ');
      console.log(`  ✓ ${parsed.name} cost:${parsed.cost} +${parsed.bonusPercent}% 条件:${condDesc}`);
    } catch {
      // skip errors silently
    }
    await sleep(DELAY);
    if (processed % 50 === 0) {
      console.log(`  进度: ${processed}/${titles.length} (找到 ${results.length} 件羁绊礼装)`);
    }
  }

  const outPath = path.join(DATA_DIR, 'craft-essences.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完成! ${results.length} 件羁绊礼装 → ${outPath}`);
  return results;
}

// ========== Image Downloader ==========

async function getImageUrl(fileName) {
  if (!fileName) return '';
  try {
    const data = await api({
      action: 'query',
      titles: `File:${fileName}`,
      prop: 'imageinfo',
      iiprop: 'url',
    });
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.url || '';
  } catch {
    return '';
  }
}

async function downloadImage(url, outPath) {
  if (!url) return;
  if (fs.existsSync(outPath)) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    console.log(`  下载: ${path.basename(outPath)}`);
  } catch (err) {
    console.log(`  下载失败: ${path.basename(outPath)} - ${err.message}`);
  }
}

async function downloadAllImages(servants, craftEssences) {
  console.log('\n=== 下载图片 ===\n');

  // Ensure image directory exists
  fs.mkdirSync(path.join(IMG_DIR, 'servants'), { recursive: true });
  fs.mkdirSync(path.join(IMG_DIR, 'ces'), { recursive: true });

  // Download servant images (limit to avoid hammering)
  let count = 0;
  for (const s of servants) {
    if (!s.imgFile) continue;
    const url = await getImageUrl(s.imgFile + '.png');
    if (url) {
      const ext = path.extname(new URL(url).pathname) || '.png';
      await downloadImage(url, path.join(IMG_DIR, 'servants', s.id + ext));
      s.imageUrl = `/img/servants/${s.id}${ext}`;
    }
    await sleep(DELAY);
    count++;
    if (count % 20 === 0) console.log(`  从者图片进度: ${count}`);
  }

  // Download CE images
  count = 0;
  for (const ce of craftEssences) {
    if (!ce.imgFile) continue;
    const url = await getImageUrl(ce.imgFile + '.png');
    if (url) {
      const ext = path.extname(new URL(url).pathname) || '.png';
      await downloadImage(url, path.join(IMG_DIR, 'ces', ce.id + ext));
      ce.imageUrl = `/img/ces/${ce.id}${ext}`;
    }
    await sleep(DELAY);
    count++;
    if (count % 20 === 0) console.log(`  礼装图片进度: ${count}`);
  }

  // Update JSON files with image URLs
  fs.writeFileSync(
    path.join(DATA_DIR, 'servants.json'),
    JSON.stringify(servants, null, 2),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'craft-essences.json'),
    JSON.stringify(craftEssences, null, 2),
    'utf-8',
  );

  console.log('\n图片下载完成!');
}

// ========== Main ==========

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  let servants = [];
  let craftEssences = [];

  if (mode === 'servants' || mode === 'all') {
    servants = await scrapeAllServants();
  }

  if (mode === 'ces' || mode === 'all') {
    craftEssences = await scrapeBondCEs();
  }

  if (mode === 'images' || mode === 'all') {
    if (servants.length === 0) {
      // Load existing data
      const sp = path.join(DATA_DIR, 'servants.json');
      const cp = path.join(DATA_DIR, 'craft-essences.json');
      if (fs.existsSync(sp)) servants = JSON.parse(fs.readFileSync(sp, 'utf-8'));
      if (fs.existsSync(cp)) craftEssences = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    }
    await downloadAllImages(servants, craftEssences);
  }

  console.log('\n=== 全部完成 ===');
  console.log(`从者: ${servants.length} → data/servants.json`);
  console.log(`礼装: ${craftEssences.length} → data/craft-essences.json`);
  console.log(`图片: public/img/`);
}

main().catch(console.error);
