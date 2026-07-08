import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toCamelCase } from '../src/shared/utils.js';
import {
  ATTRIBUTE_DEFINITIONS,
  CANDIDATE_SELECTORS,
  CANDIDATE_SELECTOR,
  KEY_ATTRIBUTE_PRIORITY,
  LOCATOR_ATTRIBUTE_PRIORITY,
  MAX_FALLBACK_VARIANTS,
  SCAN_MODE_SELECTORS,
  TESTING_ATTRIBUTE_NAMES,
  TIER_BASE_SCORES,
} from '../src/shared/constants.js';
import { detectDynamicValue } from '../src/scanner/detect-dynamic-value.js';
import { generateKey } from '../src/scanner/generate-key.js';
import { generateLocators } from '../src/scanner/generate-locators.js';
import {
  generateAllXPathVariants,
  buildTestIdFrequencyMap,
  generateXPathVariantsUpToTier,
} from '../src/scanner/generate-xpath-variants.js';
import {
  chunkArray,
  computeVariantScore,
  getVariantCounts,
  indexUniqueXPaths,
  rankXPathVariantsWithCounts,
  toRegistryLocators,
} from '../src/scanner/rank-xpath-variants.js';
import { escapeXPathLiteral, isUnstableClass } from '../src/scanner/xpath-utils.js';
import {
  buildFilteredLocator,
  enrichLocatorsWithSemantic,
  escapeLocatorString,
  generateFilterChain,
  generateSemanticLocator,
} from '../src/scanner/generate-semantic-locators.js';
import { ElementContext, XPathVariant } from '../src/scanner/scanner.types.js';

const emptyAttrs = {
  testId: null,
  id: null,
  className: null,
  role: null,
  ariaLabel: null,
  ariaLabelledBy: null,
  placeholder: null,
  name: null,
  title: null,
  alt: null,
  type: null,
  href: null,
  contentEditable: null,
  testingAttributes: {},
};

function ctx(partial: Partial<ElementContext> & Pick<ElementContext, 'tagName' | 'attributes'>): ElementContext {
  return {
    directText: null,
    ancestors: [],
    precedingLabel: null,
    siblingIndex: null,
    ...partial,
  };
}

describe('constants — attribute definitions', () => {
  test('CANDIDATE_SELECTORS includes all testing attribute selectors', () => {
    for (const name of TESTING_ATTRIBUTE_NAMES) {
      assert.ok(CANDIDATE_SELECTORS.some((s) => s.includes(name.replace('data-', 'data-'))));
    }
    assert.ok(CANDIDATE_SELECTOR.includes('[data-test]'));
    assert.ok(CANDIDATE_SELECTOR.includes('[data-qa]'));
    assert.ok(CANDIDATE_SELECTOR.includes('[title]'));
    assert.ok(CANDIDATE_SELECTOR.includes('[alt]'));
    assert.ok(CANDIDATE_SELECTOR.includes('[aria-labelledby]'));
  });

  test('ATTRIBUTE_DEFINITIONS includes testing and form attributes', () => {
    const domAttrs = ATTRIBUTE_DEFINITIONS.map((d) => d.domAttribute);
    assert.ok(domAttrs.includes('data-test'));
    assert.ok(domAttrs.includes('data-qa'));
    assert.ok(domAttrs.includes('title'));
    assert.ok(domAttrs.includes('alt'));
  });

  test('LOCATOR_ATTRIBUTE_PRIORITY includes ariaLabelledBy, title, alt', () => {
    assert.ok(LOCATOR_ATTRIBUTE_PRIORITY.includes('ariaLabelledBy'));
    assert.ok(LOCATOR_ATTRIBUTE_PRIORITY.includes('title'));
    assert.ok(LOCATOR_ATTRIBUTE_PRIORITY.includes('alt'));
  });

  test('KEY_ATTRIBUTE_PRIORITY lists key fallbacks after testId', () => {
    assert.deepEqual(KEY_ATTRIBUTE_PRIORITY, [
      'testId', 'id', 'ariaLabel', 'placeholder', 'name', 'title', 'alt', 'href',
    ]);
  });

  test('interactive scan mode includes testing attribute selectors', () => {
    const interactive = SCAN_MODE_SELECTORS.interactive;
    assert.ok(interactive.includes('[data-test]'));
    assert.ok(interactive.includes('[data-qa]'));
    assert.ok(interactive.includes('[aria-labelledby]'));
    assert.ok(interactive.includes('button'));
  });

  test('TIER_BASE_SCORES defines all 9 tiers', () => {
    for (let tier = 1; tier <= 9; tier++) {
      assert.ok(TIER_BASE_SCORES[tier] > 0);
    }
    assert.ok(TIER_BASE_SCORES[1] > TIER_BASE_SCORES[9]);
  });
});

describe('detectDynamicValue', () => {
  test('detects UUID patterns', () => {
    const result = detectDynamicValue('item-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    assert.equal(result.isDynamic, true);
    assert.equal(result.variantType, 'generalized');
    assert.ok(result.stablePrefix);
  });

  test('detects Radix-style IDs', () => {
    const result = detectDynamicValue('radix-:r1:');
    assert.equal(result.isDynamic, true);
  });

  test('detects numeric suffixes', () => {
    const result = detectDynamicValue('group-header_flex-GROUP-9597-GROUP');
    assert.equal(result.isDynamic, true);
    assert.ok(result.stablePrefix?.includes('group-header_flex-GROUP-'));
  });

  test('returns exact for stable values', () => {
    const result = detectDynamicValue('save-button');
    assert.equal(result.isDynamic, false);
    assert.equal(result.variantType, 'exact');
  });

  test('detects dynamic id with contains pattern', () => {
    const result = detectDynamicValue('submit-button-12345');
    assert.equal(result.isDynamic, true);
    assert.ok(result.stablePrefix);
  });
});

describe('computeVariantScore', () => {
  test('tier 1 exact unique scores higher than tier 9 positional', () => {
    const tier1: XPathVariant = {
      xpath: "//*[@data-testid='save']",
      tier: 1,
      strategy: 'testingAttribute',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 1,
      isRelational: false,
    };
    const tier9: XPathVariant = {
      xpath: '(//button)[3]',
      tier: 9,
      strategy: 'positional',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 1,
      isRelational: true,
    };
    assert.ok(computeVariantScore(tier1) > computeVariantScore(tier9));
  });

  test('penalizes zero and duplicate match counts', () => {
    const unique: XPathVariant = {
      xpath: '//button',
      tier: 5,
      strategy: 'text',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 1,
      isRelational: false,
    };
    const duplicate: XPathVariant = { ...unique, matchCount: 5 };
    const broken: XPathVariant = { ...unique, matchCount: 0 };
    assert.ok(computeVariantScore(unique) > computeVariantScore(duplicate));
    assert.ok(computeVariantScore(unique) > computeVariantScore(broken));
  });
});

describe('generateKey', () => {
  test('prefers data-testid over id and text', () => {
    assert.equal(
      generateKey({ attributes: { ...emptyAttrs, testId: 'save-button', id: 'save-btn' }, tagName: 'button', text: 'Save', index: 0 }),
      'saveButton'
    );
  });

  test('uses ancestor context for generic testId', () => {
    assert.equal(
      generateKey({
        attributes: { ...emptyAttrs, testId: 'box' },
        tagName: 'button',
        text: 'Save',
        index: 0,
        ancestors: [{ tagName: 'div', testId: 'goal-side-panel', id: null, role: null, ariaLabel: null }],
      }),
      'goalSidePanelSave'
    );
  });

  test('falls back to ariaLabel when no testId or id', () => {
    assert.equal(
      generateKey({ attributes: { ...emptyAttrs, ariaLabel: 'Close dialog' }, tagName: 'button', text: null, index: 0 }),
      'closeDialog'
    );
  });

  test('falls back to title attribute', () => {
    assert.equal(
      generateKey({ attributes: { ...emptyAttrs, title: 'Goal settings' }, tagName: 'button', text: null, index: 0 }),
      'goalSettings'
    );
  });
});

describe('generateAllXPathVariants — tier 1 testing attributes', () => {
  test('generates variants for data-testid and data-qa', () => {
    const element = ctx({
      tagName: 'button',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: {
          'data-testid': 'save-button',
          'data-qa': 'save-btn',
        },
      },
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map([['save-button', 1]]) });

    assert.ok(variants.some((v) => v.tier === 1 && v.xpath.includes('data-testid')));
    assert.ok(variants.some((v) => v.tier === 1 && v.xpath.includes('data-qa')));
  });

  test('skips flat testId for generic testId', () => {
    const element = ctx({
      tagName: 'div',
      attributes: {
        ...emptyAttrs,
        testId: 'box',
        testingAttributes: { 'data-testid': 'box' },
      },
    });
    const counts = new Map([['box', 3]]);
    const variants = generateAllXPathVariants(element, { testIdCounts: counts });
    const flatExact = variants.find(
      (v) => v.tier === 1 && v.xpath === "//*[@data-testid='box']" && v.variantType === 'exact'
    );
    assert.equal(flatExact, undefined);
  });
});

describe('generateAllXPathVariants — tier 3 id', () => {
  test('generates exact and generalized id variants', () => {
    const element = ctx({
      tagName: 'button',
      attributes: { ...emptyAttrs, id: 'submit-button-12345' },
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map() });

    assert.ok(variants.some((v) => v.tier === 3 && v.xpath.includes("@id='submit-button-12345'")));
    assert.ok(variants.some((v) => v.tier === 3 && v.variantType === 'generalized' && v.xpath.includes('contains(@id')));
  });
});

describe('generateAllXPathVariants — tier 5 text', () => {
  test('generates normalize-space and contains text variants', () => {
    const element = ctx({
      tagName: 'span',
      directText: 'Settings panel',
      attributes: { ...emptyAttrs },
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map() });

    assert.ok(variants.some((v) => v.tier === 5 && v.xpath.includes('normalize-space()')));
    assert.ok(variants.some((v) => v.tier === 5 && v.xpath.includes('contains(text()')));
  });
});

describe('generateAllXPathVariants — tier 6 ancestor scoped', () => {
  test('generates ancestor-scoped xpath for duplicate generic testId', () => {
    const element = ctx({
      tagName: 'button',
      directText: 'Save',
      attributes: { ...emptyAttrs, testId: 'box', testingAttributes: { 'data-testid': 'box' } },
      ancestors: [
        { tagName: 'div', testId: 'goal-side-panel', id: null, role: null, ariaLabel: null },
      ],
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map([['box', 3]]) });

    const scoped = variants.find((v) => v.tier === 6 && v.strategy === 'ancestorScoped');
    assert.ok(scoped);
    assert.match(scoped!.xpath, /goal-side-panel/);
    assert.match(scoped!.xpath, /Save/);
  });

  test('scopes by placeholder within ancestor', () => {
    const element = ctx({
      tagName: 'input',
      attributes: {
        ...emptyAttrs,
        testId: 'box',
        placeholder: 'Goal title',
        testingAttributes: { 'data-testid': 'box' },
      },
      ancestors: [
        { tagName: 'div', testId: 'goal-side-panel', id: null, role: null, ariaLabel: null },
      ],
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map([['box', 2]]) });
    const scoped = variants.find((v) => v.tier === 6 && v.xpath.includes('placeholder'));
    assert.ok(scoped);
    assert.match(scoped!.xpath, /Goal title/);
  });
});

describe('generateAllXPathVariants — tier 7 label sibling', () => {
  test('generates label-sibling xpath', () => {
    const element = ctx({
      tagName: 'input',
      attributes: { ...emptyAttrs },
      precedingLabel: 'Due by',
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map() });

    const labelCandidate = variants.find((v) => v.tier === 7 && v.strategy === 'labelSibling');
    assert.ok(labelCandidate);
    assert.match(labelCandidate!.xpath, /Due by/);
    assert.match(labelCandidate!.xpath, /following-sibling/);
  });
});

describe('generateAllXPathVariants — tier 9 positional', () => {
  test('generates positional fallback for duplicate testId', () => {
    const element = ctx({
      tagName: 'div',
      attributes: { ...emptyAttrs, testId: 'box', testingAttributes: { 'data-testid': 'box' } },
      siblingIndex: 2,
    });
    const variants = generateAllXPathVariants(element, { testIdCounts: new Map([['box', 3]]) });

    const positional = variants.find((v) => v.tier === 9 && v.strategy === 'positional');
    assert.ok(positional);
    assert.match(positional!.xpath, /\)\[2\]/);
  });
});

describe('generateLocators — backward compat', () => {
  test('generates testId xpath for static testId', () => {
    const locators = generateLocators({
      tagName: 'button',
      text: 'Save',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: { 'data-testid': 'save-button' },
      },
    });
    assert.ok(locators.xpath?.includes('save-button'));
    assert.ok(locators.recommended);
    assert.ok(Array.isArray(locators.fallbacks));
  });

  test('generates ariaLabel xpath', () => {
    const locators = generateLocators({
      tagName: 'button',
      text: null,
      attributes: { ...emptyAttrs, ariaLabel: 'Close panel' },
    });
    assert.ok(locators.xpath?.includes('aria-label'));
  });
});

describe('toRegistryLocators — storage', () => {
  test('persists recommended and fallbacks without full variants', () => {
    const locators = {
      recommended: {
        xpath: "//*[@data-testid='save']",
        tier: 1 as const,
        strategy: 'testingAttribute' as const,
        variantType: 'exact' as const,
        confidenceScore: 105,
        matchCount: 1,
        isRelational: false,
        recommended: true,
      },
      fallbacks: [
        {
          xpath: "//button[normalize-space()='Save']",
          tier: 5 as const,
          strategy: 'text' as const,
          variantType: 'exact' as const,
          confidenceScore: 65,
          matchCount: 1,
          isRelational: false,
        },
      ],
      variants: [
        { xpath: 'a', tier: 1, strategy: 'testingAttribute', variantType: 'exact', confidenceScore: 105, matchCount: 1, isRelational: false },
        { xpath: 'b', tier: 5, strategy: 'text', variantType: 'exact', confidenceScore: 65, matchCount: 1, isRelational: false },
      ],
      xpath: "//*[@data-testid='save']",
      confidence: 'high' as const,
      matchCount: 1,
      strategy: 'testingAttribute' as const,
    };

    const stored = toRegistryLocators(locators);
    assert.ok(stored.recommended);
    assert.equal(stored.fallbacks.length, 1);
    assert.equal(stored.variants, undefined);
    assert.ok(stored.fallbacks.length <= MAX_FALLBACK_VARIANTS);
  });
});

describe('escapeXPathLiteral', () => {
  test('wraps simple strings in single quotes', () => {
    assert.equal(escapeXPathLiteral('save-button'), "'save-button'");
  });
});

describe('isUnstableClass', () => {
  test('detects hashed twigs-style classes', () => {
    assert.equal(isUnstableClass('twigs-c-PJLV twigs-c-PJLV-ibHvUxT-css'), true);
  });
});

describe('buildTestIdFrequencyMap', () => {
  test('counts duplicate testIds', () => {
    const contexts = [
      ctx({ tagName: 'div', attributes: { ...emptyAttrs, testId: 'box' } }),
      ctx({ tagName: 'div', attributes: { ...emptyAttrs, testId: 'box' } }),
      ctx({ tagName: 'div', attributes: { ...emptyAttrs, testId: 'save' } }),
    ];
    const counts = buildTestIdFrequencyMap(contexts);
    assert.equal(counts.get('box'), 2);
    assert.equal(counts.get('save'), 1);
  });
});

describe('chunkArray', () => {
  test('splits arrays into fixed-size chunks', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(chunkArray([], 3), []);
  });
});

describe('indexUniqueXPaths', () => {
  test('deduplicates shared xpaths across variant lists', () => {
    const xpathToIndex = new Map<string, number>();
    const uniqueXpaths: string[] = [];
    const shared: XPathVariant = {
      xpath: "//button[@data-testid='save']",
      tier: 1,
      strategy: 'testingAttribute',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 0,
      isRelational: false,
    };
    const unique: XPathVariant = {
      xpath: "//button[@data-testid='cancel']",
      tier: 1,
      strategy: 'testingAttribute',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 0,
      isRelational: false,
    };

    const firstNew = indexUniqueXPaths(xpathToIndex, uniqueXpaths, [shared, unique]);
    const secondNew = indexUniqueXPaths(xpathToIndex, uniqueXpaths, [shared]);

    assert.deepEqual(firstNew, [shared.xpath, unique.xpath]);
    assert.deepEqual(secondNew, []);
    assert.equal(uniqueXpaths.length, 2);
    assert.equal(xpathToIndex.get(shared.xpath), 0);
    assert.equal(xpathToIndex.get(unique.xpath), 1);
  });
});

describe('getVariantCounts', () => {
  test('maps variant xpaths to global count array', () => {
    const xpathToIndex = new Map([
      ['//a', 0],
      ['//b', 1],
    ]);
    const counts = [3, 1];
    const variants: XPathVariant[] = [
      {
        xpath: '//a',
        tier: 1,
        strategy: 'testingAttribute',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: false,
      },
      {
        xpath: '//b',
        tier: 1,
        strategy: 'testingAttribute',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: false,
      },
    ];

    assert.deepEqual(getVariantCounts(variants, xpathToIndex, counts), [3, 1]);
  });
});

describe('rankXPathVariantsWithCounts', () => {
  test('prefers unique non-positional variants', () => {
    const variants: XPathVariant[] = [
      {
        xpath: "//button[@data-testid='save']",
        tier: 1,
        strategy: 'testingAttribute',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: false,
      },
      {
        xpath: "(//button)[1]",
        tier: 9,
        strategy: 'positional',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: true,
      },
    ];

    const { locators } = rankXPathVariantsWithCounts(variants, [1, 1]);
    assert.equal(locators.recommended?.xpath, "//button[@data-testid='save']");
    assert.equal(locators.matchCount, 1);
    assert.equal(locators.confidence, 'high');
  });

  test('returns empty locators for no variants', () => {
    const { locators, ranked } = rankXPathVariantsWithCounts([], []);
    assert.deepEqual(ranked, []);
    assert.equal(locators.matchCount, 0);
    assert.equal(locators.confidence, 'low');
  });
});

describe('generateXPathVariantsUpToTier', () => {
  test('limits generated tiers', () => {
    const element = ctx({
      tagName: 'button',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: { 'data-testid': 'save-button' },
      },
      directText: 'Save',
    });

    const upToTier3 = generateXPathVariantsUpToTier(element, { testIdCounts: new Map([['save-button', 1]]) }, 3);
    const allTiers = generateAllXPathVariants(element, { testIdCounts: new Map([['save-button', 1]]) });

    assert.ok(upToTier3.length > 0);
    assert.ok(allTiers.length >= upToTier3.length);
    assert.ok(!upToTier3.some((variant) => variant.tier > 3));
    assert.ok(allTiers.some((variant) => variant.tier > 3));
  });
});

describe('escapeLocatorString', () => {
  test('wraps simple strings in single quotes', () => {
    assert.equal(escapeLocatorString('Save'), "'Save'");
  });

  test('uses double quotes when value contains single quotes', () => {
    assert.equal(escapeLocatorString("Save draft's copy"), '"Save draft\'s copy"');
  });
});

describe('buildFilteredLocator', () => {
  test('chains has and hasNot filters', () => {
    const result = buildFilteredLocator("getByTestId('flex')", [
      { type: 'has', locator: "locator('#recipient-select')" },
      { type: 'hasNot', locator: "locator('[data-testid*=\"send-email-action\"]')" },
    ]);

    assert.equal(
      result,
      "getByTestId('flex').filter({ has: locator('#recipient-select') }).filter({ hasNot: locator('[data-testid*=\"send-email-action\"]') })"
    );
  });
});

describe('generateSemanticLocator', () => {
  test('prefers getByRole over getByTestId for button with text', () => {
    const element = ctx({
      tagName: 'button',
      directText: 'Save Changes',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: { 'data-testid': 'save-button' },
      },
    });

    const result = generateSemanticLocator(element, 1);
    assert.ok(result);
    assert.equal(result!.primary, "getByRole('button', { name: 'Save Changes' })");
    assert.equal(result!.strategy, 'byRole');
    assert.ok(result!.alternatives.some((locator) => locator.includes('getByTestId')));
  });

  test('generates getByLabel for labeled input', () => {
    const element = ctx({
      tagName: 'input',
      attributes: { ...emptyAttrs, placeholder: 'Enter your email' },
      precedingLabel: 'Email Address',
    });

    const result = generateSemanticLocator(element, 1);
    assert.ok(result);
    assert.equal(result!.primary, "getByLabel('Email Address')");
    assert.ok(result!.alternatives.some((locator) => locator.includes('getByPlaceholder')));
  });

  test('generates getByPlaceholder when no label exists', () => {
    const element = ctx({
      tagName: 'input',
      attributes: { ...emptyAttrs, placeholder: 'Search goals' },
    });

    const result = generateSemanticLocator(element, 1);
    assert.ok(result);
    assert.equal(result!.primary, "getByPlaceholder('Search goals')");
  });

  test('generates getByAltText for images', () => {
    const element = ctx({
      tagName: 'img',
      attributes: { ...emptyAttrs, alt: 'Company logo' },
    });

    const result = generateSemanticLocator(element, 1);
    assert.ok(result);
    assert.equal(result!.primary, "getByAltText('Company logo')");
  });

  test('falls back to css locator when only class is available', () => {
    const element = ctx({
      tagName: 'div',
      attributes: { ...emptyAttrs, className: 'content-wrapper' },
    });

    const result = generateSemanticLocator(element, 1, {
      xpath: "//div[@class='content-wrapper'][1]",
    });

    assert.ok(result);
    assert.equal(result!.primary, "locator('.content-wrapper')");
    assert.ok(result!.alternatives.some((locator) => locator.includes('xpath=')));
  });

  test('builds scoped semantic locator with filters when matchCount > 1', () => {
    const element = ctx({
      tagName: 'button',
      attributes: {
        ...emptyAttrs,
        testId: 'placeholder-button',
        testingAttributes: { 'data-testid': 'placeholder-button' },
      },
      ancestors: [
        { tagName: 'div', testId: 'flex', id: null, role: null, ariaLabel: null },
      ],
      childHints: [
        { tagName: 'select', testId: null, id: 'recipient-select', role: null, ariaLabel: null },
      ],
    });

    const result = generateSemanticLocator(element, 3);
    assert.ok(result);
    assert.ok(
      result!.primary.includes('getByTestId') ||
      result!.primary.includes('getByRole') ||
      result!.primary.includes('filter({ has:')
    );
    assert.ok(
      result!.alternatives.some((locator) => locator.includes('getByTestId')) ||
      result!.primary.includes("getByTestId('flex')")
    );
  });
});

describe('generateFilterChain', () => {
  test('returns empty filters for unique matches', () => {
    const element = ctx({ tagName: 'button', attributes: { ...emptyAttrs } });
    assert.deepEqual(generateFilterChain(element, "getByRole('button')", 1), []);
  });

  test('generates has filters from child hints', () => {
    const element = ctx({
      tagName: 'button',
      attributes: { ...emptyAttrs, testId: 'placeholder-button' },
      childHints: [
        { tagName: 'select', testId: null, id: 'recipient-select', role: null, ariaLabel: null },
      ],
    });

    const filters = generateFilterChain(element, "getByTestId('flex')", 3);
    assert.ok(filters.some((filter) => filter.type === 'has' && filter.locator.includes('#recipient-select')));
  });
});

describe('enrichLocatorsWithSemantic', () => {
  test('adds semantic fields to ranked locators', () => {
    const element = ctx({
      tagName: 'button',
      directText: 'Save',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: { 'data-testid': 'save-button' },
      },
    });

    const enriched = enrichLocatorsWithSemantic(
      {
        recommended: {
          xpath: "//button[@data-testid='save-button']",
          tier: 1,
          strategy: 'testingAttribute',
          variantType: 'exact',
          confidenceScore: 105,
          matchCount: 1,
          isRelational: false,
        },
        fallbacks: [],
        xpath: "//button[@data-testid='save-button']",
        confidence: 'high',
        matchCount: 1,
        strategy: 'testingAttribute',
      },
      element
    );

    assert.equal(enriched.semantic, "getByRole('button', { name: 'Save' })");
    assert.equal(enriched.recommended?.semanticLocator, enriched.semantic);
    assert.equal(enriched.semanticStrategy, 'byRole');
  });
});

describe('computeVariantScore — semantic boost', () => {
  test('boosts score for variants with semantic locators', () => {
    const withSemantic: XPathVariant = {
      xpath: "//button[@data-testid='save']",
      tier: 1,
      strategy: 'testingAttribute',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 1,
      isRelational: false,
      semanticLocator: "getByRole('button', { name: 'Save' })",
      semanticPriority: 1,
    };
    const withoutSemantic: XPathVariant = {
      xpath: "//button[@data-testid='save']",
      tier: 1,
      strategy: 'testingAttribute',
      variantType: 'exact',
      confidenceScore: 0,
      matchCount: 1,
      isRelational: false,
    };

    assert.ok(computeVariantScore(withSemantic) > computeVariantScore(withoutSemantic));
  });
});

describe('rankXPathVariantsWithCounts — semantic preference', () => {
  test('prefers variants with semantic locators', () => {
    const variants: XPathVariant[] = [
      {
        xpath: "//button[@data-testid='save']",
        tier: 1,
        strategy: 'testingAttribute',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: false,
      },
      {
        xpath: "//button[normalize-space()='Save']",
        tier: 5,
        strategy: 'text',
        variantType: 'exact',
        confidenceScore: 0,
        matchCount: 0,
        isRelational: false,
        semanticLocator: "getByRole('button', { name: 'Save' })",
        semanticPriority: 1,
      },
    ];

    const { locators } = rankXPathVariantsWithCounts(variants, [1, 1]);
    assert.equal(locators.semantic, "getByRole('button', { name: 'Save' })");
    assert.equal(locators.recommended?.semanticLocator, locators.semantic);
  });
});

describe('toRegistryLocators — semantic fields', () => {
  test('persists semantic locator fields', () => {
    const stored = toRegistryLocators({
      recommended: {
        xpath: "//button[@data-testid='save']",
        tier: 1,
        strategy: 'testingAttribute',
        variantType: 'exact',
        confidenceScore: 105,
        matchCount: 1,
        isRelational: false,
        semanticLocator: "getByRole('button', { name: 'Save' })",
        semanticStrategy: 'byRole',
        semanticPriority: 1,
      },
      fallbacks: [],
      xpath: "//button[@data-testid='save']",
      confidence: 'high',
      matchCount: 1,
      strategy: 'testingAttribute',
      semantic: "getByRole('button', { name: 'Save' })",
      semanticFallbacks: ["getByTestId('save')"],
      semanticStrategy: 'byRole',
      semanticPriority: 1,
    });

    assert.equal(stored.semantic, "getByRole('button', { name: 'Save' })");
    assert.deepEqual(stored.semanticFallbacks, ["getByTestId('save')"]);
    assert.equal(stored.semanticStrategy, 'byRole');
  });
});

describe('generateLocators — semantic output', () => {
  test('includes semantic locator for testId button', () => {
    const locators = generateLocators({
      tagName: 'button',
      text: 'Save',
      attributes: {
        ...emptyAttrs,
        testId: 'save-button',
        testingAttributes: { 'data-testid': 'save-button' },
      },
    });

    assert.equal(locators.semantic, "getByRole('button', { name: 'Save' })");
    assert.ok(Array.isArray(locators.semanticFallbacks));
  });
});
