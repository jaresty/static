import {LIMITS,parseModel,assertModel} from './model.mjs';
export const MAX_ENCODED=1400000;
async function transform(bytes,kind,maxBytes){
 const stream=new Blob([bytes]).stream().pipeThrough(kind==='compress'?new CompressionStream('gzip'):new DecompressionStream('gzip'));
 const reader=stream.getReader(),parts=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new Error('Decoded document exceeds 1 MiB');}parts.push(value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(total);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
export async function encode(model){assertModel(model);const bytes=new TextEncoder().encode(JSON.stringify(model));if(bytes.length>LIMITS.bytes)throw new Error('Document exceeds 1 MiB');const zipped=await transform(bytes,'compress',LIMITS.bytes);let binary='';for(let i=0;i<zipped.length;i+=8192)binary+=String.fromCharCode(...zipped.subarray(i,i+8192));return 'gz1.'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export async function decode(encoded){if(encoded.length>MAX_ENCODED)throw new Error('Encoded input too large');if(!/^gz1\.[A-Za-z0-9_-]+$/.test(encoded))throw new Error('Unsupported share encoding');const binary=atob(encoded.slice(4).replaceAll('-','+').replaceAll('_','/'));const zipped=Uint8Array.from(binary,c=>c.charCodeAt(0));const bytes=await transform(zipped,'decompress',LIMITS.bytes);return parseModel(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
export async function shareURL(model,base=globalThis.location?.href||'https://example.com/causal-playground/'){const url=new URL(base);url.hash='model='+await encode(model);if(url.href.length>LIMITS.url)throw new Error('Link exceeds 8,000 characters. Download a model file instead.');return url.href;}
export function saveLocal(model,storage=globalThis.localStorage){try{storage.setItem('causal-playground.v1',JSON.stringify(model));return {ok:true};}catch(error){return {ok:false,error:'Autosave unavailable. Download a file to preserve your work. '+error.message};}}
export function loadLocal(storage=globalThis.localStorage){const value=storage.getItem('causal-playground.v1');return value?parseModel(value):null;}
