import { Page } from '@playwright/test';
import { MAX_FALLBACK_VARIANTS, TIER_BASE_SCORES, XPATH_BATCH_CHUNK_SIZE } from '../shared/constants.js';
import {
  LocatorConfidence,
  LocatorTemplates,
  XPathVariant,
} from './scanner.types.js';

export function computeVariantScore(variant: XPathVariant): number {
  const tierBase = TIER_BASE_SCORES[variant.tier] ?? 0;
  let score = tierBase;

  if (variant.matchCount === 1) score += 10;
  if (variant.variantType === 'exact') score += 5;
  if (variant.matchCount > 1) score -= variant.matchCount * 2;
  if (variant.matchCount === 0) score -= 50;

  return score;
}

function scoreToConfidence(score: number): LocatorConfidence {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

const EMPTY_LOCATORS: LocatorTemplates = {
  fallbacks: [],
  xpath: '',
  confidence: 'low',
  matchCount: 0,
  strategy: 'positional',
};

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0 || items.length === 0) return items.length === 0 ? [] : [items];

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function indexUniqueXPaths(
  xpathToIndex: Map<string, number>,
  uniqueXpaths: string[],
  variants: XPathVariant[]
): string[] {
  const newXpaths: string[] = [];

  for (const variant of variants) {
    if (xpathToIndex.has(variant.xpath)) continue;

    xpathToIndex.set(variant.xpath, uniqueXpaths.length);
    uniqueXpaths.push(variant.xpath);
    newXpaths.push(variant.xpath);
  }

  return newXpaths;
}

export function getVariantCounts(
  variants: XPathVariant[],
  xpathToIndex: Map<string, number>,
  counts: number[]
): number[] {
  return variants.map((variant) => counts[xpathToIndex.get(variant.xpath)!] ?? 0);
}

export async function batchCountXPaths(page: Page, xpaths: string[]): Promise<number[]> {
  if (xpaths.length === 0) return [];

  return page.evaluate((paths) => {
    return paths.map((xpath) => {
      try {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        return result.snapshotLength;
      } catch {
        return 0;
      }
    });
  }, xpaths);
}

export async function batchCountXPathsChunked(
  page: Page,
  xpaths: string[],
  chunkSize: number = XPATH_BATCH_CHUNK_SIZE
): Promise<number[]> {
  if (xpaths.length === 0) return [];

  const chunks = chunkArray(xpaths, chunkSize);
  const counts: number[] = [];

  for (const chunk of chunks) {
    const chunkCounts = await batchCountXPaths(page, chunk);
    counts.push(...chunkCounts);
  }

  return counts;
}

export function rankXPathVariantsWithCounts(
  variants: XPathVariant[],
  counts: number[]
): { ranked: XPathVariant[]; locators: LocatorTemplates } {
  if (variants.length === 0) {
    return { ranked: [], locators: { ...EMPTY_LOCATORS } };
  }

  const withCounts = variants.map((variant, index) => {
    const matchCount = counts[index] ?? 0;
    const scored = { ...variant, matchCount, confidenceScore: 0 };
    scored.confidenceScore = computeVariantScore(scored);
    return scored;
  });

  const ranked = [...withCounts].sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }
    return a.tier - b.tier;
  });

  let recommended =
    ranked.find((variant) => variant.matchCount === 1 && variant.tier < 9) ??
    ranked.find((variant) => variant.matchCount === 1) ??
    ranked.find((variant) => variant.matchCount > 0 && variant.tier < 9) ??
    ranked[0];

  if (recommended) {
    recommended = { ...recommended, recommended: true };
    const idx = ranked.findIndex((variant) => variant.xpath === recommended!.xpath);
    if (idx >= 0) ranked[idx] = recommended;
  }

  const fallbacks = ranked
    .filter((variant) => variant.xpath !== recommended?.xpath)
    .slice(0, MAX_FALLBACK_VARIANTS);

  const locators: LocatorTemplates = {
    recommended,
    fallbacks,
    variants: ranked,
    xpath: recommended?.xpath,
    xpathRelational: recommended?.isRelational ? recommended.xpath : undefined,
    xpathTemplate: recommended?.xpathTemplate ?? recommended?.xpath,
    testId: recommended?.testId,
    css: recommended?.css,
    confidence: scoreToConfidence(recommended?.confidenceScore ?? 0),
    matchCount: recommended?.matchCount ?? 0,
    strategy: recommended?.strategy,
  };

  return { ranked, locators };
}

export async function rankXPathVariants(
  page: Page,
  variants: XPathVariant[]
): Promise<{ ranked: XPathVariant[]; locators: LocatorTemplates }> {
  if (variants.length === 0) {
    return { ranked: [], locators: { ...EMPTY_LOCATORS } };
  }

  const counts = await batchCountXPaths(page, variants.map((variant) => variant.xpath));
  return rankXPathVariantsWithCounts(variants, counts);
}

export function toRegistryLocators(locators: LocatorTemplates): LocatorTemplates {
  const { recommended, fallbacks, xpath, xpathRelational, xpathTemplate, testId, css, confidence, matchCount, strategy } =
    locators;

  return {
    recommended,
    fallbacks,
    xpath,
    xpathRelational,
    xpathTemplate,
    testId,
    css,
    confidence,
    matchCount,
    strategy,
  };
}
