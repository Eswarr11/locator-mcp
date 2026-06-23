import { Page } from '@playwright/test';
import { batchCountXPaths } from './rank-xpath-variants.js';

export async function countXPathMatches(page: Page, xpath: string): Promise<number> {
  const [count] = await batchCountXPaths(page, [xpath]);
  return count;
}
