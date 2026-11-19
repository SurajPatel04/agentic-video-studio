import {IconsManifest} from 'react-icons';
import {writeFile} from 'node:fs/promises';

const packs = await Promise.all(IconsManifest.map(async ({id}) => {
  const path = `react-icons/${id}`;
  return Object.keys(await import(path)).map(name => `${path}/${name}`);
}));
await writeFile(new URL('../../library/react-icons.json', import.meta.url), JSON.stringify(packs.flat().sort()) + '\n');
