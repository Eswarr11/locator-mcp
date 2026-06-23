import { Page } from '@playwright/test';
import {
  ScanOptions,
  ScanResult,
  LocatorRegistry,
  ElementMetadata,
  ScanStats,
  LocatorTemplates,
} from './scanner.types.js';
import { extractAllElementContexts } from './extract-element-context.js';
import { generateKey } from './generate-key.js';
import {
  buildTestIdFrequencyMap,
  generateAllXPathVariants,
} from './generate-xpath-variants.js';
import { rankXPathVariants, toRegistryLocators } from './rank-xpath-variants.js';
import { saveRegistry } from './save-registry.js';
import {
  GENERIC_TEST_IDS,
  INTERACTIVE_ROLES,
  INTERACTIVE_TAGS,
  SCAN_MODE_SELECTORS,
  ScanMode,
} from '../shared/constants.js';

function isInteractive(tagName: string, role: string | null): boolean {
  return INTERACTIVE_TAGS.has(tagName) || (role !== null && INTERACTIVE_ROLES.has(role));
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

export class ScannerService {
  async scan(page: Page, options: ScanOptions = {}): Promise<ScanResult> {
    const scanMode: ScanMode = options.scanMode ?? 'interactive';
    const scanId = options.scanName ?? `scan-${Date.now()}`;
    const registryFile = `registry/${scanId}.json`;
    const pageUrl = page.url();

    const selector = SCAN_MODE_SELECTORS[scanMode];
    const contexts = await extractAllElementContexts(page, { selector });
    const testIdCounts = buildTestIdFrequencyMap(contexts);
    const pageContext = { testIdCounts };

    const registry: LocatorRegistry = {};
    const keyCounts = new Map<string, number>();
    const xpathIndex = new Map<string, string>();
    const scanElements: ElementMetadata[] = [];

    for (let index = 0; index < contexts.length; index++) {
      const ctx = contexts[index];
      const variants = generateAllXPathVariants(ctx, pageContext);
      const { locators } = await rankXPathVariants(page, variants);

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
      const scanLocators: LocatorTemplates = {
        ...registryLocators,
        variants: locators.variants,
      };

      const metadata: ElementMetadata = {
        key,
        tagName: ctx.tagName,
        text: ctx.directText,
        attributes: ctx.attributes,
        locators: scanLocators,
      };

      registry[key] = { ...metadata, locators: registryLocators };
      scanElements.push(metadata);

      if (recommendedXpath && locators.matchCount === 1) {
        xpathIndex.set(recommendedXpath, key);
      }
    }

    await saveRegistry(registry, scanId);

    const elements = scanElements;
    const stats = buildStats(elements);
    const warnings = buildWarnings(elements, testIdCounts);

    return {
      scanId,
      pageUrl,
      scannedAt: new Date().toISOString(),
      totalElements: elements.length,
      elements,
      stats,
      warnings,
      registryFile,
    };
  }
}

export const scanner = new ScannerService();
