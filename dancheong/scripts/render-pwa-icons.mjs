// Rasterize the code-native icon at each platform's actual size.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../public/icons/dancheong-lotus.svg',import.meta.url));
for(const [name,size] of [['dancheong-192',192],['dancheong-512',512],['apple-touch-icon',180],['dancheong-32',32]]){
 await sharp(source,{density:192}).resize(size,size).png().toFile(fileURLToPath(new URL('../public/icons/'+name+'.png',import.meta.url)));
}
await writeFile(new URL('../public/favicon.svg',import.meta.url),source);
await writeFile(new URL('../public/icons/dancheong-mark.svg',import.meta.url),source);
