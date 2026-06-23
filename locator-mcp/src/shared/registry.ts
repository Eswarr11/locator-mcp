import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = resolve(__dirname, '../../registry');

export function getRegistryPath(scanName: string): string {
  return resolve(REGISTRY_DIR, `${scanName}.json`);
}

export async function listRegistryFiles(): Promise<string[]> {
  try {
    const files = await readdir(REGISTRY_DIR);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

export async function readRegistry(scanName: string): Promise<string | null> {
  try {
    return await readFile(getRegistryPath(scanName), 'utf-8');
  } catch {
    return null;
  }
}
