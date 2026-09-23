export const CAREER_SOURCE_LABEL='NPB公式 個人年度別成績';

export function careerStepKind(label=''){
  if(/(?:高$|高等学校|高校)/.test(label))return '高校';
  if(/(?:大$|大学)/.test(label))return '大学';
  if(/独立|リーグ|BC|四国IL|九州アジア/.test(label))return '独立リーグ';
  if(/会社|製作所|製鉄|銀行|鉄道|ガス|電力|自動車|生命|クラブ|マジック|Honda|ENEOS|JR/.test(label))return '社会人・クラブ';
  return '所属歴';
}

export function parseDraftLabel(raw=''){
  if(raw==null)return null;
  const text=String(raw).trim();
  if(!text)return null;
  const year=Number(text.match(/(\d{4})年/)?.[1])||null;
  const round=Number(text.match(/(?:ドラフト)(\d+)(?:位|巡目)/)?.[1])||null;
  return {raw:text,year,round,type:/育成/.test(text)?'development':'regular'};
}

export function buildTeamHistory(rows=[]){
  const unique=[...new Map(rows.filter(r=>Number.isInteger(r.year)&&r.team).map(r=>[`${r.year}|${r.team}`,r])).values()].sort((a,b)=>a.year-b.year||a.team.localeCompare(b.team,'ja'));
  const out=[];
  for(const row of unique){
    const last=out.at(-1);
    if(last&&last.team===row.team&&last.endYear+1===row.year)last.endYear=row.year;
    else out.push({team:row.team,startYear:row.year,endYear:row.year});
  }
  return out;
}

export function careerPeriod(item){
  if(item.startYear==null)return '年次未掲載';
  return item.startYear===item.endYear?`${item.startYear}年`:`${item.startYear}〜${item.endYear}年`;
}
