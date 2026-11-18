// Fixed illustrative template, not an editor engine. No imports, I/O or hidden corrections.
export const H = 1 / 4096;
export const END = 120;
export const SAMPLE = .25;
export const TOLERANCE = Object.freeze({B:.1, S:.002});
export const DEFAULTS = Object.freeze({B0:0,S0:0,A0:12,A1:4,change:true,changeDay:20,K:10,impairment:true});
export const PRESETS = Object.freeze({
  recovery:{...DEFAULTS},
  empty:{...DEFAULTS,A0:0,change:false,S0:.8},
  drain:{...DEFAULTS,B0:20,S0:.8,A0:0,change:false},
  overload:{...DEFAULTS,change:false},
  shock:{...DEFAULTS,B0:20,A0:4,change:false},
  sustained:{...DEFAULTS,B0:0,A0:12,change:false},
});
export function validate(input={}) {
  const c={...DEFAULTS,...input};
  const bounds={B0:[0,200],S0:[0,1],A0:[0,20],A1:[0,20],K:[1,20],changeDay:[1,119]};
  for(const [key,[lo,hi]] of Object.entries(bounds)) {
    if(typeof c[key] !== 'number'||!Number.isFinite(c[key])||c[key]<lo||c[key]>hi) throw new RangeError(`${key} must be between ${lo} and ${hi}.`);
  }
  if(!Number.isInteger(c.changeDay)) throw new RangeError('Change day must be a whole day.');
  for(const key of ['change','impairment'])if(typeof c[key]!=='boolean')throw new TypeError(`${key} must be boolean.`);
  return c;
}
export function rates(B,S,c) {
  const alpha=c.impairment?.5:0;
  const W=B/(c.K*2),target=W/(1+W),P=1-alpha*S;
  return {W,target,P,C:Math.min(c.K*P,B)}; // Tc=1, Tw=2, tau=2 days.
}
export const arrivalAt=(c,t)=>c.change&&t>=c.changeDay?c.A1:c.A0;
export function simulate(input={}, {h=H,onStep}={}) {
  const c=validate(input);
  if(!Number.isFinite(h)||h<=0||h>.25||!Number.isInteger(SAMPLE/h)||END/h>1966080)throw new RangeError('Unsupported step: quarter-day sampling must align; at most 1,966,080 steps.');
  const count=END/h, stride=SAMPLE/h, changeIndex=c.changeDay/h;
  if(!Number.isInteger(changeIndex))throw new RangeError('Change day must align with steps.');
  let B=c.B0,S=c.S0,I=0,O=0,prev=null,maxResidual=0;
  const samples=[];
  function sample(n) {
    const t=n*h, a=rates(B,S,c), residual=B-c.B0-I+O;
    maxResidual=Math.max(maxResidual,Math.abs(residual));
    samples.push({t,B,S,I,O,...a,A:arrivalAt(c,t),residual,prev});
  }
  sample(0);
  for(let n=0;n<count;n++) {
    const A=c.change&&n>=changeIndex?c.A1:c.A0,a=rates(B,S,c);
    const dI=h*A,dO=h*a.C;
    const nextB=B+h*(A-a.C),nextS=S+h*(a.target-S)/2;
    if(onStep)onStep({n,t:n*h,h,B,S,A,...a,nextB,nextS,dI,dO});
    // Retain only the last internal interval at each displayed state.
    if((n+1)%stride===0)prev={t:n*h,B,S,A,C:a.C,dI,dO};
    I+=dI;O+=dO;B=nextB;S=nextS;
    maxResidual=Math.max(maxResidual,Math.abs(B-c.B0-I+O));
    if((n+1)%stride===0)sample(n+1);
  }
  return {config:c,h,samples,maxResidual,steps:count};
}
export function compare(coarse,fine) {
  let B=0,S=0;
  coarse.samples.forEach((s,i)=>{
    if(s.t!==fine.samples[i]?.t)throw new Error('Comparison times differ.');
    B=Math.max(B,Math.abs(s.B-fine.samples[i].B));
    S=Math.max(S,Math.abs(s.S-fine.samples[i].S));
  });
  return {B,S,pass:B<=TOLERANCE.B&&S<=TOLERANCE.S};
}
export function resolvedRun(input={}) {
  const run=simulate(input),fine=simulate(input,{h:H/2});
  return {...run,resolution:compare(run,fine)};
}
