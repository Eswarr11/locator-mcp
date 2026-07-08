export {
  buildTestIdFrequencyMap,
  generateAllXPathVariants,
} from './generate-xpath-variants.js';

import { ElementContext, LocatorTemplates } from './scanner.types.js';
import { generateAllXPathVariants, buildTestIdFrequencyMap } from './generate-xpath-variants.js';
import { enrichLocatorsWithSemantic } from './generate-semantic-locators.js';

/** @deprecated Use generateAllXPathVariants */
export function generateLocatorCandidates(
  ctx: ElementContext,
  testIdCounts: Map<string, number>
) {
  return generateAllXPathVariants(ctx, { testIdCounts }).map((v) => ({
    xpath: v.xpath,
    xpathTemplate: v.xpathTemplate,
    testId: v.testId,
    css: v.css,
    confidence: v.tier <= 2 ? 'high' as const : v.tier <= 5 ? 'medium' as const : 'low' as const,
    strategy: v.strategy,
    isRelational: v.isRelational,
  }));
}

interface GenerateLocatorsInput {
  tagName: string;
  text: string | null;
  attributes: ElementContext['attributes'];
}

export function generateLocators(input: GenerateLocatorsInput): LocatorTemplates {
  const ctx: ElementContext = {
    tagName: input.tagName,
    directText: input.text,
    attributes: input.attributes,
    ancestors: [],
    precedingLabel: null,
    siblingIndex: null,
  };

  const testIdCounts = new Map<string, number>();
  if (ctx.attributes.testId) {
    testIdCounts.set(ctx.attributes.testId, 1);
  }

  const variants = generateAllXPathVariants(ctx, { testIdCounts });
  if (variants.length === 0) return { fallbacks: [] };

  const best = variants[0];
  const base: LocatorTemplates = {
    recommended: { ...best, matchCount: 0, confidenceScore: 0 },
    fallbacks: variants.slice(1, 6).map((v) => ({ ...v, matchCount: 0, confidenceScore: 0 })),
    xpath: best.xpath,
    xpathRelational: best.isRelational ? best.xpath : undefined,
    xpathTemplate: best.xpathTemplate ?? best.xpath,
    testId: best.testId,
    css: best.css,
    confidence: best.tier <= 2 ? 'high' : best.tier <= 5 ? 'medium' : 'low',
    strategy: best.strategy,
  };

  return enrichLocatorsWithSemantic(base, ctx);
}

export function candidateToLocatorTemplate(
  candidate: ReturnType<typeof generateLocatorCandidates>[number],
  matchCount: number
): LocatorTemplates {
  return {
    recommended: {
      xpath: candidate.xpath,
      xpathTemplate: candidate.xpathTemplate,
      tier: 1,
      strategy: candidate.strategy,
      variantType: 'exact',
      confidenceScore: 0,
      matchCount,
      isRelational: candidate.isRelational,
      testId: candidate.testId,
      css: candidate.css,
    },
    fallbacks: [],
    xpath: candidate.xpath,
    xpathRelational: candidate.isRelational ? candidate.xpath : undefined,
    xpathTemplate: candidate.xpathTemplate ?? candidate.xpath,
    testId: candidate.testId,
    css: candidate.css,
    confidence: matchCount === 1 ? candidate.confidence : 'low',
    matchCount,
    strategy: candidate.strategy,
  };
}
