import { writeFile } from 'node:fs/promises';
import { LocatorRegistry } from './scanner.types.js';
import { getRegistryPath } from '../shared/registry.js';

export async function saveRegistry(registry: LocatorRegistry, scanName: string): Promise<void> {
  await writeFile(getRegistryPath(scanName), JSON.stringify(registry), 'utf-8');
}
