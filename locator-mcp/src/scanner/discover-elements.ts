import { ElementHandle, Page } from '@playwright/test';
import { DiscoverElements } from './scanner.types.js';
import {
  IGNORED_TAGS,
  SCAN_MODE_SELECTORS,
  ScanMode,
} from '../shared/constants.js';

export const discoverElements: DiscoverElements = async (
  page: Page,
  scanMode: ScanMode = 'interactive'
): Promise<ElementHandle<HTMLElement>[]> => {
  const selector = SCAN_MODE_SELECTORS[scanMode];
  const elements = await page.$$(selector);

  const filteredElements: ElementHandle<HTMLElement>[] = [];

  for (const element of elements) {
    const tagName = await element.evaluate((el) => el.tagName.toLowerCase());

    if (IGNORED_TAGS.has(tagName)) {
      continue;
    }

    filteredElements.push(element as ElementHandle<HTMLElement>);
  }

  return filteredElements;
};
