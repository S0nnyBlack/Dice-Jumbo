export const MANDATORY_COLUMNS=["Gore","Dole","Slobodna"];
export const OPTIONAL_COLUMNS=["Najava","Kontra najava","R","N","D","O","M"];
export const rollDie=()=>Math.floor(Math.random()*6)+1;
export const rollDice=(n=6)=>Array.from({length:n},rollDie);
export const sum=values=>values.reduce((a,b)=>a+b,0);
export function counts(values){return values.reduce((m,v)=>(m[v]=(m[v]||0)+1,m),{})}
export function evaluate(values){
 if(!Array.isArray(values)||values.length!==5)return {valid:false,categories:[]};
 const c=counts(values), freq=Object.values(c), total=sum(values), uniq=[...new Set(values)].sort((a,b)=>a-b).join(",");
 const categories=["Slobodna","Gore","Dole"];
 if(uniq==="1,2,3,4,5"||uniq==="2,3,4,5,6")categories.push("Kenta");
 if(freq.includes(3))categories.push("Triling");
 if(freq.includes(3)&&freq.includes(2))categories.push("Ful");
 if(freq.includes(4))categories.push("Poker");
 if(freq.includes(5))categories.push("Yamb");
 return {valid:true,total,categories};
}
export function score(category,values){
 if(values.length!==5)return null;
 const total=sum(values),c=counts(values),uniq=[...new Set(values)].sort((a,b)=>a-b).join(",");
 switch(category){
 case"Slobodna":case"Gore":case"Dole":case"MAXIMUM":case"MINIMUM":return total;
 case"Triling":return total+20;
 case"Ful":return total+30;
 case"Poker":return total+40;
 case"Yamb":return total+50;
 case"Kenta":return uniq==="1,2,3,4,5"?66:56;
 default:return null;
 }}
