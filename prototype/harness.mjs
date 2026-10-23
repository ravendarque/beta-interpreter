import fs from 'fs';
let src = fs.readFileSync('bi.js','utf8');
const cut = src.indexOf('const ta = document');
const tail = src.indexOf('const SAMPLES');
const end = src.indexOf("document.getElementById('samples')");
src = src.slice(0, cut) + src.slice(tail, end);
eval(src + `
for (const [k,v] of Object.entries(SAMPLES)) { const r = parse(v); console.log('##', k, '| terrain', r.terrain.map(x=>x.name).join(','), '| features', r.features.map(x=>x.name).join(','));
 r.beats.forEach(b=>console.log('  ', say(b), b.crux?'[CRUX]':'', b.issues.join(' ')));
 if (r.amb.length) console.log('  amb:', r.amb.map(a=>a.word+'→'+a.options.map(o=>o.name).join('/')).join('; '));
 if (r.unknown.length) console.log('  unknown:', r.unknown.map(u=>u.raw+(u.guess?'?'+u.guess:'')).join(', '));
 if (r.fuzzy.length) console.log('  fuzzy:', r.fuzzy.map(f=>f.from+'→'+f.to).join(', ')); }`);
