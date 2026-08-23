import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
const css = fs.readFileSync('J:/Code/Anime_Organize/anime-vault/src/app/globals.css','utf8');
const compiler = await compile(css, {
  base: 'J:/Code/Anime_Organize/anime-vault/src/app',
  loadStylesheet: async (id, base) => {
    if (id === 'tailwindcss') {
      return { path: id, base, content: fs.readFileSync('J:/Code/Anime_Organize/anime-vault/node_modules/tailwindcss/index.css','utf8') };
    }
    const p = path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p,'utf8') };
  },
});
const out = compiler.build(['h-3','h-4','h-7','h-8','h-11','h-12','w-8','p-2','gap-1','mt-4','size-8']);
const lines = out.split('\n').filter(l => /^\.(h-|w-|p-|gap-|mt-|size-)/.test(l.trim()) || /height|width|padding|gap|margin/.test(l));
console.log(out.split('}').filter(b=>/^\s*\.(h|w|p|gap|mt|size)-/.test(b)).map(b=>b.trim()+'}').join('\n'));
const root = out.split('}').filter(b=>/--spacing/.test(b)).join('}\n');
console.log('--- spacing vars in root ---');
console.log(out.match(/--spacing[^;]*;/g)?.slice(0,40).join('\n'));
