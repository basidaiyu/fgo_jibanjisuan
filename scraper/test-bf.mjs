import { readFileSync } from 'fs';

// Simple test to verify brute force works
async function test() {
  const { precompute } = await import('../src/algorithms/precompute.ts');
  const { bruteForceOptimize } = await import('../src/algorithms/brute-force.ts');

  const servants = JSON.parse(readFileSync('data/servants.json', 'utf-8')).slice(0, 12);
  const ces = JSON.parse(readFileSync('data/craft-essences.json', 'utf-8'));

  console.log('Servants:', servants.length, 'CEs:', ces.length);

  const params = {
    baseBond: 1318, teaKettleMultiplier: 1, eventBonusPercent: 0, fixedBonus: 0,
    supportInFrontRow: true, excludedServantIds: [], requiredServantIds: [],
    allowedClasses: [], requiredCEIds: [], excludedCEIds: []
  };

  const pre = precompute(servants, ces);
  console.log('Precompute done, starting brute force...');

  const start = Date.now();
  try {
    const result = bruteForceOptimize(pre, params, (pct, best) => {
      console.log(`Progress: ${pct.toFixed(0)}% best: ${best}`);
    });
    console.log(`Done in ${Date.now() - start}ms`);
    console.log('Total bond:', result.totalBond);
    console.log('Total cost:', result.totalCost);
    result.team.forEach(t => {
      console.log(`  ${t.isSupport ? '[助战]' : t.isFrontRow ? '[前排]' : '[后排]'} ${t.servant.name} + ${t.craftEssence.name} = ${t.bondBreakdown.finalBond}`);
    });
  } catch (e) {
    console.error('ERROR:', e.message || e);
  }
}

test();
