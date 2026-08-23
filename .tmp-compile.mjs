import postcss from 'postcss';
import tw from '@tailwindcss/postcss';
import fs from 'node:fs';
const from = 'J:/Code/Anime_Organize/anime-vault/src/app/globals.css';
const css = fs.readFileSync(from, 'utf8');
const res = await postcss([tw()]).process(css, { from });
fs.writeFileSync('J:/Code/Anime_Organize/anime-vault/.tmp-out.css', res.css);
console.log('bytes', res.css.length);
