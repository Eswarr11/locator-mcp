import { Page } from '@playwright/test';
import { MAX_FALLBACK_VARIANTS, TIER_BASE_SCORES } from '../shared/constants.js';
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

export async function rankXPathVariants(
  page: Page,
  variants: XPathVariant[]
): Promise<{ ranked: XPathVariant[]; locators: LocatorTemplates }> {
  if (variants.length === 0) {
    return {
      ranked: [],
      locators: { fallbacks: [], xpath: '', confidence: 'low', matchCount: 0, strategy: 'positional' },
    };
  }

  const xpaths = variants.map((v) => v.xpath);
  const counts = await batchCountXPaths(page, xpaths);

  const withCounts = variants.map((v, i) => {
    const matchCount = counts[i] ?? 0;
    const scored = { ...v, matchCount, confidenceScore: 0 };
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
    ranked.find((v) => v.matchCount === 1 && v.tier < 9) ??
    ranked.find((v) => v.matchCount === 1) ??
    ranked.find((v) => v.matchCount > 0 && v.tier < 9) ??
    ranked[0];

  if (recommended) {
    recommended = { ...recommended, recommended: true };
    const idx = ranked.findIndex((v) => v.xpath === recommended!.xpath);
    if (idx >= 0) ranked[idx] = recommended;
  }

  const fallbacks = ranked
    .filter((v) => v.xpath !== recommended?.xpath)
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
