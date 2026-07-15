// Debug condition extraction from {{特攻}} templates
const effect = `关卡通关时{{特攻|秩序·善|〔秩序且善〕|前缀=属性|类型=特效|礼装=1}}特性获得的牵绊值增加4%
关卡通关时{{特攻|秩序·善|〔秩序且善〕|前缀=属性|类型=特效|礼装=1}}特性获得的牵绊值增加20%[最大解放]`;

const effect2 = `关卡通关时{{特攻|Rider|link=Rider|类型=特效|礼装=1}}职阶获得的牵绊值增加4%
关卡通关时{{特攻|Rider|link=Rider|类型=特效|礼装=1}}职阶获得的牵绊值增加20%[最大解放]`;

function extractConditions(effect) {
  const conditions = [];
  const teikouRe = /\{\{特攻\|([^}]+)\}\}/g;
  let tm;
  while ((tm = teikouRe.exec(effect)) !== null) {
    const inner = tm[1]; // Everything between {{特攻| and }}
    const parts = inner.split('|');
    console.log('Parts:', parts);
    // Find positional params (no = sign)
    const positional = parts.filter(p => !p.includes('='));
    console.log('Positional:', positional);
    // Last positional is usually the display name
    const traitText = positional[positional.length - 1] || positional[0];
    // Remove brackets
    const cleaned = traitText.replace(/[〔〕]/g, '');
    console.log('Cleaned:', cleaned);

    // Parse compound traits
    if (cleaned.includes('且')) {
      conditions.push(...cleaned.split('且').map(s => s.trim()));
    } else if (cleaned.includes('·')) {
      conditions.push(...cleaned.split('·').map(s => s.trim()));
    } else {
      conditions.push(cleaned.trim());
    }
  }
  return conditions;
}

console.log('Effect 1 (检查报告):');
console.log(extractConditions(effect));
console.log();
console.log('Effect 2 (秘密任务):');
console.log(extractConditions(effect2));
