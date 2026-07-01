import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Page } from '@playwright/test';
import { IGNORED_TAGS, MAX_ANCESTOR_DEPTH, TESTING_ATTRIBUTE_NAMES } from '../shared/constants.js';
import { ElementContext } from './scanner.types.js';

interface ExtractContextOptions {
  selector: string;
}

const EXTRACT_CONTEXT_BROWSER_FN = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'extract-element-context.browser.js'),
  'utf8'
);

export async function extractAllElementContexts(
  page: Page,
  options: ExtractContextOptions
): Promise<ElementContext[]> {
  return page.evaluate(
    ({ fnSource, selector, maxDepth, ignoredTags, testingAttributeNames }) => {
      const extract = new Function(
        'options',
        `${fnSource}\nreturn extractContextInBrowser(options);`
      ) as (options: {
        selector: string;
        maxDepth: number;
        ignoredTags: string[];
        testingAttributeNames: string[];
      }) => ElementContext[];

      return extract({ selector, maxDepth, ignoredTags, testingAttributeNames });
    },
    {
      fnSource: EXTRACT_CONTEXT_BROWSER_FN,
      selector: options.selector,
      maxDepth: MAX_ANCESTOR_DEPTH,
      ignoredTags: [...IGNORED_TAGS],
      testingAttributeNames: [...TESTING_ATTRIBUTE_NAMES],
    }
  );
}
