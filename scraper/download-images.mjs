/**
 * 下载从者和礼装图片
 * 用法: node scraper/download-images.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const IMG_DIR = path.resolve(__dirname, '../public/img');
const API = 'https://fgo.wiki/api.php';
const DELAY = 150;

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Get image URL from file name via MediaWiki API
 */
async function getImageUrl(fileName) {
  if (!fileName) return '';
  // Try with .png extension first, then .jpg
  for (const ext of ['.png', '.jpg', '.jpeg', '']) {
    try {
      const fullName = fileName + ext;
      const data = await api({
        action: 'query',
        titles: `File:${fullName}`,
        prop: 'imageinfo',
        iiprop: 'url',
      });
      const pages = data.query?.pages || {};
      const page = Object.values(pages)[0];
      if (page && !page.missing && page.imageinfo?.length > 0) {
        return page.imageinfo[0].url;
      }
    } catch { /* skip */ }
  }
  return '';
}

async function downloadImage(url, outPath) {
  if (!url || fs.existsSync(outPath)) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * For servants: get image from the first stage card (文件1)
 * We need the wikitext to know the file name.
 */
async function getServantImageFileName(title) {
  try {
    const data = await api({
      action: 'parse',
      page: title,
      prop: 'wikitext',
    });
    const t = data.parse?.wikitext?.['*'];
    if (!t) return '';
    // Extract |文件4=... or |文件1=... (stage 4 or stage 1)
    const m4 = t.match(/\|文件4\s*=\s*(.+)/m);
    if (m4) return m4[1].trim();
    const m1 = t.match(/\|文件1\s*=\s*(.+)/m);
    if (m1) return m1[1].trim();
    return '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('=== 下载从者与礼装图片 ===\n');

  // Load data
  const servants = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'servants.json'), 'utf-8'));
  const ces = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'craft-essences.json'), 'utf-8'));

  fs.mkdirSync(path.join(IMG_DIR, 'servants'), { recursive: true });
  fs.mkdirSync(path.join(IMG_DIR, 'ces'), { recursive: true });

  // Download servant images
  console.log(`下载从者图片 (${servants.length} 人)...`);
  let sCount = 0;
  for (const s of servants) {
    if (s.imageUrl && fs.existsSync(path.join('public', s.imageUrl))) {
      sCount++;
      continue; // already have it
    }

    // Use mooncell page title to get image
    const pageTitle = s.name;
    const fileName = await getServantImageFileName(pageTitle);
    if (fileName) {
      const url = await getImageUrl(fileName);
      if (url) {
        const ext = path.extname(new URL(url).pathname) || '.png';
        // Use safe filename (avoid URI-encoded chars)
        const safeId = s.id.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
        const localPath = `/img/servants/${safeId}${ext}`;
        const fullPath = path.join(IMG_DIR, 'servants', safeId + ext);
        const ok = await downloadImage(url, fullPath);
        if (ok) {
          s.imageUrl = localPath;
          sCount++;
        }
      }
    }

    if (sCount % 20 === 0) {
      console.log(`  从者图片: ${sCount}/${servants.length}`);
      // Save progress periodically
      fs.writeFileSync(path.join(DATA_DIR, 'servants.json'), JSON.stringify(servants, null, 2), 'utf-8');
    }
    await sleep(DELAY);
  }
  console.log(`从者图片完成: ${sCount}`);

  // Download CE images
  console.log(`\n下载礼装图片 (${ces.length} 件)...`);
  let ceCount = 0;
  for (const ce of ces) {
    if (ce.imageUrl && fs.existsSync(path.join('public', ce.imageUrl))) {
      ceCount++;
      continue;
    }

    const fileName = ce.imgFile || ce.name;
    if (fileName) {
      const url = await getImageUrl(fileName);
      if (url) {
        const ext = path.extname(new URL(url).pathname) || '.png';
        const safeId = ce.id.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
        const localPath = `/img/ces/${safeId}${ext}`;
        const fullPath = path.join(IMG_DIR, 'ces', safeId + ext);
        const ok = await downloadImage(url, fullPath);
        if (ok) {
          ce.imageUrl = localPath;
          ceCount++;
        }
      }
    }
    if (ceCount % 5 === 0) {
      console.log(`  礼装图片: ${ceCount}/${ces.length}`);
      fs.writeFileSync(path.join(DATA_DIR, 'craft-essences.json'), JSON.stringify(ces, null, 2), 'utf-8');
    }
    await sleep(DELAY);
  }
  console.log(`礼装图片完成: ${ceCount}`);

  // Save final data
  fs.writeFileSync(path.join(DATA_DIR, 'servants.json'), JSON.stringify(servants, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'craft-essences.json'), JSON.stringify(ces, null, 2), 'utf-8');

  console.log('\n=== 图片下载完成 ===');
  console.log(`从者: ${sCount}/${servants.length}`);
  console.log(`礼装: ${ceCount}/${ces.length}`);
  console.log(`目录: ${IMG_DIR}`);
}

main().catch(console.error);
