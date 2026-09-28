export const COLUMN_DEFS=[
 {id:"down",name:"Dole",mandatory:true,direction:"down"},
 {id:"free",name:"Slobodna",mandatory:true,direction:"free"},
 {id:"up",name:"Gore",mandatory:true,direction:"up"},
 {id:"announced",name:"Najava",mandatory:false,direction:"announce"},
 {id:"contra",name:"Kontra najava",mandatory:false,direction:"contra"},
 {id:"r",name:"R",mandatory:false,direction:"normal"},
 {id:"n",name:"N",mandatory:false,direction:"normal"},
 {id:"d",name:"D",mandatory:false,direction:"normal"},
 {id:"o",name:"O",mandatory:false,direction:"normal"},
 {id:"m",name:"M",mandatory:false,direction:"normal"},
];
export const VALUE_ROWS=[1,2,3,4,5,6];
export const COMBINATION_ROWS=["KENTA","TRILING","FUL","POKER","YAMB"];
export const rollDie=()=>Math.floor(Math.random()*6)+1;
export const rollDice=(n=6)=>Array.from({length:n},rollDie);
export const sum=v=>v.reduce((a,b)=>a+b,0);
export function counts(v){return v.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{})}
export function upperScore(v,face){return v.filter(x=>x===face).reduce((a,b)=>a+b,0)}
export function analyse(v){
 if(!Array.isArray(v)||v.length!==5)return {valid:false};
 const c=counts(v),freq=Object.values(c),u=[...new Set(v)].sort((a,b)=>a-b);
 return {
  valid:true,total:sum(v),counts:c,upper:[1,2,3,4,5,6].reduce((m,f)=>(m[f]=upperScore(v,f),m),{}),
  kenta:u.join(",")==="1,2,3,4,5"||u.join(",")==="2,3,4,5,6",
  kentaScore:u.join(",")==="1,2,3,4,5"?66:u.join(",")==="2,3,4,5,6"?56:null,
  triling:freq.includes(3),ful:freq.includes(3)&&freq.includes(2),poker:freq.includes(4),yamb:freq.includes(5)
 };
}
export function combinationScore(row,v){
 const a=analyse(v);if(!a.valid)return null;
 if(row==="KENTA")return a.kenta?a.kentaScore:null;
 if(row==="TRILING")return a.triling?a.total+20:null;
 if(row==="FUL")return a.ful?a.total+30:null;
 if(row==="POKER")return a.poker?a.total+40:null;
 if(row==="YAMB")return a.yamb?a.total+50:null;
 return null;
}
export function availableEntries(columnIds,cells,values,{crossOut=false}={}){
 const validDice=Array.isArray(values)&&values.length>=1&&values.length<=5&&values.every(value=>Number.isInteger(value)&&value>=1&&value<=6);
 if(!crossOut&&!validDice)return[];
 const rowsToScore=[...VALUE_ROWS.map(String),"MAX","MIN",...COMBINATION_ROWS];
 const out=[];
 for(const colId of columnIds){
  const column=COLUMN_DEFS.find(item=>item.id===colId);
  if(!column)continue;
  const candidates=["up","down"].includes(colId)?[directionOrder(colId,cells)]:rowsToScore;
  for(const row of candidates){
   if(!row||!rowsToScore.includes(row))continue;
   if(cells[colId+"::"+row]!==undefined&&cells[colId+"::"+row]!==null)continue;
   if(crossOut){out.push({colId,colName:column.name,row,value:0});continue;}
   let value=null;
   if(VALUE_ROWS.map(String).includes(row))value=values.filter(die=>die===Number(row)).reduce((total,die)=>total+die,0);
   else if(row==="MAX"||row==="MIN")value=values.reduce((total,die)=>total+die,0);
   else if(values.length===5)value=combinationScore(row,values);
   if(value!==null&&value!==undefined)out.push({colId,colName:column.name,row,value});
  }
 }
 return out;
}
export function directionOrder(colId,cells){
 const open=row=>cells[colId+"::"+row]===undefined||cells[colId+"::"+row]===null;
 const rows=["1","2","3","4","5","6","MAX","MIN","KENTA","TRILING","FUL","POKER","YAMB"];
 if(colId==="down"){for(const r of rows)if(open(r))return r}
 if(colId==="up"){for(let i=rows.length-1;i>=0;i--)if(open(rows[i]))return rows[i]}
 return null;
}
