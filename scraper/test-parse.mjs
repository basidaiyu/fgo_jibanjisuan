// Quick test of servant parsing
const CLASS_MAP = {Saber:'剣士',Archer:'弓兵',Lancer:'槍兵',Rider:'騎兵',Caster:'術師',Assassin:'殺人鬼',Berserker:'狂戦士',Ruler:'裁決者',Avenger:'復讐者',MoonCancer:'月の癌',AlterEgo:'分離者',Foreigner:'降臨者',Pretender:'詐称者',Shielder:'盾兵'};
const costMap = {0:0,1:3,2:4,3:7,4:12,5:16};

async function parseServant(title) {
  const url = 'https://fgo.wiki/api.php?action=parse&page=' + encodeURIComponent(title) + '&prop=wikitext&format=json';
  const r = await fetch(url);
  const d = await r.json();
  const t = d.parse.wikitext['*'];
  const start = t.indexOf('{{基础数值');
  if (start < 0) return null;
  const end = t.indexOf('}}\n==', start);
  if (end < 0) return null;
  const block = t.substring(start, end + 2);

  const get = (key) => {
    const re = new RegExp('\\|' + key + '\\s*=\\s*(.+)', 'm');
    const m = block.match(re);
    return m ? m[1].trim() : '';
  };

  const name = get('中文名') || get('中文战斗名');
  if (!name) return null;

  const rarity = parseInt(get('稀有度')) || 0;
  const chars = [];
  const a1 = get('属性1'); if (a1) chars.push(a1);
  const a2 = get('属性2'); if (a2) chars.push(a2);
  const sa = get('副属性'); if (sa) chars.push(sa);
  for (let i = 1; i <= 30; i++) {
    const c = get('特性' + i);
    if (c) chars.push(c);
  }
  if (get('人型') === '是') chars.push('人型');
  const g = get('性别');
  if (g === '女性') chars.push('女性');
  else if (g === '男性') chars.push('男性');

  return {
    id: 's_' + encodeURIComponent(name),
    name,
    class: CLASS_MAP[get('职阶')] || get('职阶'),
    cost: costMap[rarity] || 0,
    characteristics: [...new Set(chars)],
  };
}

async function main() {
  const titles = ['阿尔托莉雅·潘德拉贡', '吉尔伽美什', '赫拉克勒斯', '山之翁'];
  for (const t of titles) {
    const s = await parseServant(t);
    if (s) {
      console.log(s.name, '|', s.class, '| cost:', s.cost, '| chars:', s.characteristics.join(', '));
    } else {
      console.log(t, '→ FAILED');
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

main().catch(e => console.error(e));
