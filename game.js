export const COLUMN_DEFS=[
 {id:"down",name:"Dole",mandatory:true,direction:"down"},
 {id:"free",name:"Slobodna",mandatory:true,direction:"free"},
 {id:"up",name:"Gore",mandatory:true,direction:"up"},
 {id:"announced",name:"Najava",mandatory:false,direction:"announce"},
 {id:"contra",name:"Kontra najava",mandatory:false,direction:"contra"},
 {id:"r",name:"R",mandatory:false,direction:"center-out"},
 {id:"n",name:"N",mandatory:false,direction:"both-ends"},
 {id:"d",name:"D",mandatory:false,direction:"manual"},
 {id:"o",name:"O",mandatory:false,direction:"required"},
 {id:"m",name:"M",mandatory:false,direction:"maximum"}
];
export const VALUE_ROWS=[1,2,3,4,5,6];
export const COMBINATION_ROWS=["KENTA","TRILING","FUL","POKER","YAMB"];
export const SCORE_ROWS=[...VALUE_ROWS.map(String),"MAX","MIN",...COMBINATION_ROWS];
export const rollDie=()=>Math.floor(Math.random()*6)+1;
export const rollDice=(n=6)=>Array.from({length:n},rollDie);
export const sum=v=>v.reduce((a,b)=>a+b,0);
export function counts(v){return v.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{})}
export function upperScore(v,face){return v.filter(x=>x===face).reduce((a,b)=>a+b,0)}
export function analyse(v){
 if(!Array.isArray(v)||v.length!==5)return {valid:false};
 const c=counts(v),freq=Object.values(c),u=[...new Set(v)].sort((a,b)=>a-b);
 return {
  valid:true,total:sum(v),counts:c,
  upper:[1,2,3,4,5,6].reduce((m,f)=>(m[f]=upperScore(v,f),m),{}),
  kenta:u.join(",")==="1,2,3,4,5"||u.join(",")==="2,3,4,5,6",
  triling:freq.includes(3),ful:freq.includes(3)&&freq.includes(2),poker:freq.includes(4),yamb:freq.includes(5)
 };
}
export function combinationScore(row,v,{rolls=3,manual=false}={}){
 const a=analyse(v);if(!a.valid)return null;
 if(row==="KENTA")return a.kenta?(manual?66:rolls===1?66:rolls===2?56:46):null;
 if(row==="TRILING")return a.triling?a.total+20:null;
 if(row==="FUL")return a.ful?a.total+30:null;
 if(row==="POKER"){
  if(!a.poker)return null;
  const fourCount=Object.values(a.counts).find(count=>count>=4);
  const face=Number(Object.keys(a.counts).find(value=>a.counts[value]===fourCount));
  return face*4+40;
 }
 if(row==="YAMB")return a.yamb?a.total+50:null;
 return null;
}
const open=(cells,col,row)=>cells[col+"::"+row]===undefined||cells[col+"::"+row]===null;
const validDice=values=>Array.isArray(values)&&values.length>=1&&values.length<=5&&values.every(value=>Number.isInteger(value)&&value>=1&&value<=6);
function requiredColumnReady(columnIds,cells){
 const stop=columnIds.indexOf("o");
 if(stop<0)return true;
 return columnIds.slice(0,stop).every(col=>SCORE_ROWS.every(row=>!open(cells,col,row)));
}
export function frontierRows(colId,cells){
 const directions={
  r:[["MAX","6","5","4","3","2","1"],["MIN","KENTA","TRILING","FUL","POKER","YAMB"]],
  n:[["1","2","3","4","5","6","MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"],["YAMB","POKER","FUL","TRILING","KENTA","MIN","MAX","6","5","4","3","2","1"]]
 }[colId];
 if(!directions)return [];
 return [...new Set(directions.map(rows=>rows.find(row=>open(cells,colId,row))).filter(Boolean))];
}
export function availableEntries(columnIds,cells,values,{crossOut=false,announcedRow=null,contraRow=null,rolls=3,manualColumn="d"}={}){
 if(!crossOut&&!validDice(values))return[];
 const out=[];
 const restricted=contraRow?{column:"contra",row:contraRow}:announcedRow?{column:"announced",row:announcedRow}:null;
 const announcedFull=columnIds.includes("announced")&&SCORE_ROWS.every(row=>!open(cells,"announced",row));
 for(const colId of columnIds){
  if(restricted&&colId!==restricted.column)continue;
  if(colId==="m")continue;
  if(colId==="o"&&!requiredColumnReady(columnIds,cells))continue;
  if(colId===manualColumn&&rolls!==1)continue;
  if(!restricted&&colId==="announced"&&!crossOut)continue;
  if(!restricted&&colId==="contra"&&!crossOut&&!announcedFull)continue;
  const column=COLUMN_DEFS.find(item=>item.id===colId);
  if(!column)continue;
  const candidates=["up","down"].includes(colId)?[directionOrder(colId,cells)]:["r","n"].includes(colId)?frontierRows(colId,cells):SCORE_ROWS;
  for(const row of candidates){
   if(restricted&&row!==restricted.row)continue;
   if(!row||!SCORE_ROWS.includes(row)||!open(cells,colId,row))continue;
   if(crossOut){out.push({colId,colName:column.name,row,value:0,crossOut:true});continue;}
   let value=null;
   if(VALUE_ROWS.map(String).includes(row))value=upperScore(values,Number(row));
   else if(row==="MAX"||row==="MIN")value=sum(values);
   else if(values.length===5)value=combinationScore(row,values,{rolls,manual:colId===manualColumn});
   if(value!==null&&value!==undefined)out.push({colId,colName:column.name,row,value});
  }
 }
 return out;
}
export function directionOrder(colId,cells){
 const rows=SCORE_ROWS;
 if(colId==="down"){for(const row of rows)if(open(cells,colId,row))return row;}
 if(colId==="up"){for(let i=rows.length-1;i>=0;i--)if(open(cells,colId,rows[i]))return rows[i];}
 return null;
}
