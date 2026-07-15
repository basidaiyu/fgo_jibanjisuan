// Test CE parsing with multi-line aware get
async function test() {
  const r = await fetch('https://fgo.wiki/api.php?action=parse&page=检查报告&prop=wikitext&format=json');
  const d = await r.json();
  const w = d.parse.wikitext['*'];

  let start = w.indexOf('{{概念礼装'), depth = 0, end = -1;
  for(let i=start; i<w.length-1; i++) {
    if(w.substring(i,i+2)==='{{') depth++;
    else if(w.substring(i,i+2)==='}}') { depth--; if(depth===0) { end=i; break; } }
  }
  const block = w.substring(start, end+2);

  const get = (k) => {
    const re = new RegExp('\\|' + k + '\\s*=\\s*([\\s\\S]*?)(?=\\n\\||\\}\\}$)', 'm');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  console.log('Name:', get('名称'));
  console.log('Rarity:', get('稀有度'));
  console.log('Cost:', get('cost'));
  console.log('Icon:', get('图标'));
  console.log('Class:', get('礼装分类'));
  const effect = get('持有技能');
  console.log('Effect (first 300):', effect.substring(0, 300));
  const mlb = effect.match(/(\d+)%[^\n]*\[最大解放\]/);
  console.log('MLB:', mlb ? mlb[1]+'%' : 'NOT FOUND');

  // Also test 迦勒底午餐时光 (simple, no {{特攻}})
  const r2 = await fetch('https://fgo.wiki/api.php?action=parse&page=迦勒底午餐时光&prop=wikitext&format=json');
  const d2 = await r2.json();
  const w2 = d2.parse.wikitext['*'];
  let s2=w2.indexOf('{{概念礼装'), d2d=0, e2=-1;
  for(let i=s2;i<w2.length-1;i++){if(w2.substring(i,i+2)==='{{')d2d++;else if(w2.substring(i,i+2)==='}}'){d2d--;if(d2d===0){e2=i;break;}}}
  const b2=w2.substring(s2,e2+2);
  const eff2 = b2.match(new RegExp('\\|持有技能\\s*=\\s*([\\s\\S]*?)(?=\\n\\||\\}\\}$)', 'm'));
  const e2t = eff2 ? eff2[1].trim() : '';
  console.log('\n迦勒底午餐时光 effect:', e2t.substring(0, 200));
  const mlb2 = e2t.match(/(\d+)%[^\n]*\[最大解放\]/);
  console.log('MLB:', mlb2 ? mlb2[1]+'%' : 'NOT FOUND');
}
test().catch(e => console.error(e));
