// Kept byte-semantically aligned with published schema.json by core tests.
const ref=name=>({$ref:`#/$defs/${name}`});
const entity=(type,fields,required=Object.keys(fields))=>({allOf:[ref('base')],unevaluatedProperties:false,required,properties:{type:{const:type},...fields}});
export const schema={
 '$schema':'https://json-schema.org/draft/2020-12/schema',
 '$id':'stock-flow-playground/schema.json',
 title:'Stock-flow playground version 1',
 description:'Runtime validation additionally enforces reserved IDs, unique IDs, references, auxiliary DAG, flow endpoint units, expression grammar/depth, byte and step bounds. No migration from causal-playground.',
 type:'object',additionalProperties:false,required:['version','title','time','entities'],
 properties:{version:{const:1},title:ref('name'),view:{type:'object',additionalProperties:false,required:['positions'],properties:{positions:{type:'object',maxProperties:40,propertyNames:ref('id'),additionalProperties:{type:'object',additionalProperties:false,required:['x','y'],properties:{x:{type:'number',minimum:-10000,maximum:10000},y:{type:'number',minimum:-10000,maximum:10000}}}}}},time:{type:'object',additionalProperties:false,required:['unit','dt','horizon'],properties:{unit:ref('unit'),dt:{type:'number',minimum:.000001,maximum:1000000},horizon:{type:'number',minimum:.000001,maximum:1000000}}},entities:{type:'array',minItems:1,maxItems:40,items:{oneOf:['stock','parameter','auxiliary','flow'].map(ref)}}},
 $defs:{
 name:{type:'string',minLength:1,maxLength:80,pattern:'^(?=.*\\S)[^\\u0000-\\u001f]+$'},
 unit:{type:'string',minLength:1,maxLength:24,pattern:'^(?=.*\\S)[^\\u0000-\\u001f]+$'},
 id:{type:'string',pattern:'^[a-z][a-z0-9_]{0,31}$',not:{enum:['constructor','prototype','__proto__','min','max','abs','delay']}},
 number:{type:'number',minimum:-1000000000000,maximum:1000000000000},expression:{type:'string',minLength:1,maxLength:512,description:'Restricted arithmetic and delay(stock_id, integer_steps 0–100); delay accepts stock IDs only. Delay-capable documents require integral horizon/dt. See runtime grammar.'},
 base:{type:'object',required:['id','type','name','unit'],properties:{id:ref('id'),type:{enum:['stock','parameter','auxiliary','flow']},name:ref('name'),unit:ref('unit')}},
 stock:entity('stock',{initial:{type:'number',minimum:0,maximum:1000000000000}}),
 parameter:entity('parameter',{value:ref('number')}),
 auxiliary:entity('auxiliary',{expression:ref('expression')}),
 flow:entity('flow',{expression:ref('expression'),source:{oneOf:[ref('id'),{type:'null'}]},target:{oneOf:[ref('id'),{type:'null'}]}})
 }
};
