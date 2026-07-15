// Test CE parsing
async function test() {
  const titles = ['迦勒底午餐时光','迦勒底午茶时光','检查报告','秘密任务','名侦探芙尔摩斯','格兰·卡瓦洛','手稿之翼','迦勒底晚餐时光'];
  for(const t of titles) {
    try {
      const r = await fetch('https://fgo.wiki/api.php?action=parse&page='+encodeURIComponent(t)+'&prop=wikitext&format=json');
      const d = await r.json();
      if(!d.parse){console.log(t+': page not found');continue;}
      const w = d.parse.wikitext['*'];
      const start = w.indexOf('{{概念礼装');
      if(start<0){console.log(t+': no template');continue;}
      let depth=0, end=-1;
      for(let i=start;i<w.length-1;i++){
        if(w.substring(i,i+2)==='{{')depth++;
        else if(w.substring(i,i+2)==='}}'){depth--;if(depth===0){end=i;break;}}
      }
      const block = w.substring(start,end+2);
      const get = (k) => {
        const re = new RegExp('\\|' + k + '\\s*=\\s*(.+)', 'm');
        const m = block.match(re);
        return m ? m[1].trim() : '';
      };
      const icon = get('图标');
      const rarity = get('稀有度');
      const name = get('名称');
      const effect = get('持有技能');
      const cls = get('礼装分类');
      const mlb = effect.match(/(\d+)%\s*\[/);
      console.log(name, '| rarity:', rarity, '| icon:', icon, '| class:', cls, '| MLB:', mlb?mlb[1]+'%':'?');
    } catch(e) {console.log(t+': ERROR', e.message);}
    await new Promise(r=>setTimeout(r,200));
  }
}
test();
