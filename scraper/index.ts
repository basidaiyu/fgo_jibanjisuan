/**
 * 一键爬取: npx tsx scraper/index.ts
 *
 * 依次爬取从者和礼装数据，输出到 data/ 目录
 */

import { execSync } from 'child_process';
import * as path from 'path';

async function main() {
  console.log('=== FGO Mooncell 数据爬虫 ===\n');

  const scripts = [
    { file: 'scrape-servants.ts', name: '从者数据' },
    { file: 'scrape-ces.ts', name: '礼装数据' },
  ];

  for (const { file, name } of scripts) {
    console.log(`\n--- 爬取${name} ---`);
    try {
      execSync(`npx tsx ${path.join(__dirname, file)}`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
      });
      console.log(`✓ ${name}爬取完成`);
    } catch {
      console.error(`✗ ${name}爬取失败`);
    }
  }

  console.log('\n=== 全部爬取完成 ===');
  console.log('数据文件位于: data/servants.json, data/craft-essences.json');
}

main();
