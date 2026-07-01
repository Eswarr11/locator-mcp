import { Page } from '@playwright/test';
import {
  ScanOptions,
  ScanResult,
  LocatorRegistry,
  ElementMetadata,
  ScanStats,
  LocatorTemplates,
  ElementContext,
  XPathTier,
  XPathVariant,
  ScanTimings,
} from './scanner.types.js';
import { extractAllElementContexts } from './extract-element-context.js';
import { generateKey } from './generate-key.js';
import {
  buildTestIdFrequencyMap,
  generateXPathVariantsUpToTier,
} from './generate-xpath-variants.js';
import {
  batchCountXPathsChunked,
  getVariantCounts,
  indexUniqueXPaths,
  rankXPathVariantsWithCounts,
  toRegistryLocators,
} from './rank-xpath-variants.js';
import { saveRegistry } from './save-registry.js';
import { escapeXPathLiteral } from './xpath-utils.js';
import {
  GENERIC_TEST_IDS,
  INTERACTIVE_ROLES,
  INTERACTIVE_TAGS,
  SCAN_MODE_SELECTORS,
  ScanMode,
} from '../shared/constants.js';

const TIER_EXPANSION_STEPS: XPathTier[] = [3, 6, 9];

function isInteractive(tagName: string, role: string | null): boolean {
  return INTERACTIVE_TAGS.has(tagName) || (role !== null && INTERACTIVE_ROLES.has(role));
}

function hasStrongUniqueMatch(locators: LocatorTemplates): boolean {
  const recommended = locators.recommended;
  return recommended !== undefined && recommended.matchCount === 1 && recommended.tier < 9;
}

function tryUniqueTestIdShortcut(
  ctx: ElementContext,
  testIdCounts: Map<string, number>,
  xpathToIndex: Map<string, number>,
  globalCounts: number[]
): LocatorTemplates | null {
  const testId = ctx.attributes.testId;
  if (!testId || GENERIC_TEST_IDS.has(testId)) return null;
  if ((testIdCounts.get(testId) ?? 0) !== 1) return null;

  const xpath = `//${ctx.tagName}[@data-testid=${escapeXPathLiteral(testId)}]`;
  const countIndex = xpathToIndex.get(xpath);
  if (countIndex === undefined) return null;
  if (globalCounts[countIndex] !== 1) return null;

  const variant: XPathVariant = {
    xpath,
    tier: 1,
    strategy: 'testingAttribute',
    variantType: 'exact',
    confidenceScore: 0,
    matchCount: 1,
    isRelational: false,
    testId: `[data-testid='${testId}']`,
  };

  return rankXPathVariantsWithCounts([variant], [1]).locators;
}

function buildStats(elements: ElementMetadata[]): ScanStats {
  let unique = 0;
  let duplicate = 0;
  let lowConfidence = 0;
  let interactive = 0;

  for (const el of elements) {
    const matchCount = el.locators.matchCount ?? el.locators.recommended?.matchCount;
    if (matchCount === 1) unique++;
    else if (matchCount !== undefined && matchCount > 1) duplicate++;
    if (el.locators.confidence === 'low') lowConfidence++;
    if (isInteractive(el.tagName, el.attributes.role)) interactive++;
  }

  return {
    total: elements.length,
    unique,
    duplicate,
    lowConfidence,
    interactive,
  };
}

function buildWarnings(
  elements: ElementMetadata[],
  testIdCounts: Map<string, number>
): string[] {
  const warnings: string[] = [];

  for (const [testId, count] of testIdCounts) {
    if (count > 1 && GENERIC_TEST_IDS.has(testId)) {
      warnings.push(`${count} elements share generic testId '${testId}' — relational XPath applied`);
    } else if (count > 1) {
      warnings.push(`${count} elements share testId '${testId}' — relational XPath applied`);
    }
  }

  const multiMatch = elements.filter((e) => (e.locators.matchCount ?? 0) > 1).length;
  if (multiMatch > 0) {
    warnings.push(`${multiMatch} elements have matchCount > 1`);
  }

  return warnings;
}

async function countAndMergeXPaths(
  page: Page,
  xpathToIndex: Map<string, number>,
  uniqueXpaths: string[],
  globalCounts: number[],
  variants: XPathVariant[]
): Promise<void> {
  const newXpaths = indexUniqueXPaths(xpathToIndex, uniqueXpaths, variants);
  if (newXpaths.length === 0) return;

  const startIndex = globalCounts.length;
  const newCounts = await batchCountXPathsChunked(page, newXpaths);
  for (let i = 0; i < newCounts.length; i++) {
    globalCounts[startIndex + i] = newCounts[i]!;
  }
}

function rankElementVariants(
  variants: XPathVariant[],
  xpathToIndex: Map<string, number>,
  globalCounts: number[]
): LocatorTemplates {
  const counts = getVariantCounts(variants, xpathToIndex, globalCounts);
  return rankXPathVariantsWithCounts(variants, counts).locators;
}

async function buildElementVariants(
  page: Page,
  contexts: ElementContext[],
  pageContext: { testIdCounts: Map<string, number> },
  testIdCounts: Map<string, number>
): Promise<{
  elementVariants: XPathVariant[][];
  elementLocators: (LocatorTemplates | null)[];
  generateMs: number;
  validateMs: number;
}> {
  const elementVariants: XPathVariant[][] = Array.from({ length: contexts.length }, () => []);
  const elementLocators: (LocatorTemplates | null)[] = Array.from({ length: contexts.length }, () => null);
  const xpathToIndex = new Map<string, number>();
  const uniqueXpaths: string[] = [];
  const globalCounts: number[] = [];
  let generateMs = 0;
  let validateMs = 0;

  let pending = contexts.map((_, index) => index);

  for (const maxTier of TIER_EXPANSION_STEPS) {
    const variantsToCount: XPathVariant[] = [];

    const generateStart = performance.now();
    for (const index of pending) {
      const ctx = contexts[index]!;
      const variants = generateXPathVariantsUpToTier(ctx, pageContext, maxTier);
      elementVariants[index] = variants;
      variantsToCount.push(...variants);
    }
    generateMs += performance.now() - generateStart;

    const validateStart = performance.now();
    await countAndMergeXPaths(page, xpathToIndex, uniqueXpaths, globalCounts, variantsToCount);
    validateMs += performance.now() - validateStart;

    const nextPending: number[] = [];

    for (const index of pending) {
      const ctx = contexts[index]!;
      const shortcut = tryUniqueTestIdShortcut(ctx, testIdCounts, xpathToIndex, globalCounts);
      if (shortcut) {
        elementLocators[index] = shortcut;
        continue;
      }

      const locators = rankElementVariants(elementVariants[index]!, xpathToIndex, globalCounts);
      if (hasStrongUniqueMatch(locators) || maxTier === 9) {
        elementLocators[index] = locators;
        continue;
      }

      nextPending.push(index);
    }

    pending = nextPending;
    if (pending.length === 0) break;
  }

  for (const index of pending) {
    if (elementLocators[index] === null) {
      elementLocators[index] = rankElementVariants(
        elementVariants[index]!,
        xpathToIndex,
        globalCounts
      );
    }
  }

  return { elementVariants, elementLocators, generateMs, validateMs };
}

export class ScannerService {
  async scan(page: Page, options: ScanOptions = {}): Promise<ScanResult> {
    const totalStart = performance.now();
    const scanMode: ScanMode = options.scanMode ?? 'interactive';
    const scanId = options.scanName ?? `scan-${Date.now()}`;
    const registryFile = `registry/${scanId}.json`;
    const pageUrl = page.url();

    const selector = SCAN_MODE_SELECTORS[scanMode];

    const extractStart = performance.now();
    const contexts = await extractAllElementContexts(page, { selector });
    const extractMs = performance.now() - extractStart;

    const testIdCounts = buildTestIdFrequencyMap(contexts);
    const pageContext = { testIdCounts };

    const { elementLocators, generateMs, validateMs } = await buildElementVariants(
      page,
      contexts,
      pageContext,
      testIdCounts
    );

    const rankStart = performance.now();
    const registry: LocatorRegistry = {};
    const keyCounts = new Map<string, number>();
    const xpathIndex = new Map<string, string>();
    const scanElements: ElementMetadata[] = [];

    for (let index = 0; index < contexts.length; index++) {
      const ctx = contexts[index]!;
      const locators = elementLocators[index]!;

      const baseKey = generateKey({
        attributes: ctx.attributes,
        tagName: ctx.tagName,
        text: ctx.directText,
        index,
        ancestors: ctx.ancestors,
      });

      const recommendedXpath = locators.recommended?.xpath ?? locators.xpath;
      const existingKeyForXPath = recommendedXpath ? xpathIndex.get(recommendedXpath) : undefined;

      if (existingKeyForXPath && locators.matchCount === 1) {
        const existing = registry[existingKeyForXPath];
        if (existing) {
          existing.aliases = [...(existing.aliases ?? []), baseKey];
          scanElements.push({ ...existing, key: existing.key });
          continue;
        }
      }

      const count = (keyCounts.get(baseKey) ?? 0) + 1;
      keyCounts.set(baseKey, count);
      const key = count === 1 ? baseKey : `${baseKey}${count}`;

      const registryLocators = toRegistryLocators(locators);

      const metadata: ElementMetadata = {
        key,
        tagName: ctx.tagName,
        text: ctx.directText,
        attributes: ctx.attributes,
        locators: registryLocators,
      };

      registry[key] = metadata;
      scanElements.push(metadata);

      if (recommendedXpath && locators.matchCount === 1) {
        xpathIndex.set(recommendedXpath, key);
      }
    }
    const rankMs = performance.now() - rankStart;

    const saveStart = performance.now();
    await saveRegistry(registry, scanId);
    const saveMs = performance.now() - saveStart;

    const elements = scanElements;
    const stats = buildStats(elements);
    const warnings = buildWarnings(elements, testIdCounts);
    const timings: ScanTimings = {
      extractMs,
      generateMs,
      validateMs,
      rankMs,
      saveMs,
      totalMs: performance.now() - totalStart,
    };

    return {
      scanId,
      pageUrl,
      scannedAt: new Date().toISOString(),
      totalElements: elements.length,
      elements,
      stats,
      warnings,
      registryFile,
      timings,
    };
  }
}

export const scanner = new ScannerService();
