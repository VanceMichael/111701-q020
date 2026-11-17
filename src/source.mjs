import { readFile } from 'node:fs/promises';

export async function readSource(path = new URL('../data/source.json', import.meta.url)) {
  const text = await readFile(path, 'utf8');
  const page = JSON.parse(text);
  if (!page.source || !Array.isArray(page.items)) {
    throw new Error('来源页缺少 source 或 items');
  }
  return page;
}
