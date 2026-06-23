import { GENERIC_TEST_IDS } from '../shared/constants.js';
import { detectDynamicValue } from './detect-dynamic-value.js';
import {
  ElementContext,
  LocatorStrategy,
  VariantPageContext,
  XPathTier,
  XPathVariant,
} from './scanner.types.js';
import { escapeXPathLiteral, isUnstableClass } from './xpath-utils.js';

function isGenericTestId(testId: string | null): boolean {
  return testId !== null && GENERIC_TEST_IDS.has(testId);
}

function makeVariant(
  partial: Omit<XPathVariant, 'confidenceScore' | 'matchCount'> & { matchCount?: number }
): XPathVariant {
  return {
    confidenceScore: 0,
    matchCount: partial.matchCount ?? 0,
    ...partial,
  };
}

function addExactAndGeneralized(
  variants: XPathVariant[],
  base: Omit<XPathVariant, 'confidenceScore' | 'matchCount' | 'variantType' | 'xpathTemplate' | 'xpath'>,
  value: string,
  attrExpr: (v: string, mode: 'exact' | 'generalized') => string
): void {
  variants.push(makeVariant({
    ...base,
    xpath: attrExpr(value, 'exact'),
    variantType: 'exact',
  }));

  const analysis = detectDynamicValue(value);
  if (analysis.isDynamic && analysis.stablePrefix) {
    variants.push(makeVariant({
      ...base,
      xpath: attrExpr(analysis.stablePrefix, 'generalized'),
      xpathTemplate: analysis.templateVar
        ? attrExpr(analysis.templateVar, 'generalized')
        : undefined,
      variantType: 'generalized',
    }));
  }
}

function tier1TestingAttributes(ctx: ElementContext, pageContext: VariantPageContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, attributes } = ctx;

  for (const [attrName, value] of Object.entries(attributes.testingAttributes)) {
    if (!value || (attrName === 'data-testid' && isGenericTestId(value))) continue;
    const count = pageContext.testIdCounts.get(value) ?? 0;
    if (attrName === 'data-testid' && count > 1 && !isGenericTestId(value)) {
      // still add but relational may be better
    }

    addExactAndGeneralized(
      variants,
      { tier: 1, strategy: 'testingAttribute', isRelational: false, testId: `[${attrName}='${value}']` },
      value,
      (v, mode) => {
        if (mode === 'exact') {
          return `//${tagName}[@${attrName}=${escapeXPathLiteral(v)}]`;
        }
        return `//${tagName}[contains(@${attrName},${escapeXPathLiteral(v)})]`;
      }
    );

    variants.push(makeVariant({
      tier: 1,
      strategy: 'testingAttribute',
      isRelational: false,
      variantType: 'exact',
      xpath: `//*[@${attrName}=${escapeXPathLiteral(value)}]`,
      testId: `[${attrName}='${value}']`,
    }));
  }

  return variants;
}

function tier2Accessibility(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, attributes } = ctx;

  if (attributes.ariaLabel) {
    addExactAndGeneralized(
      variants,
      { tier: 2, strategy: 'accessibility', isRelational: false },
      attributes.ariaLabel,
      (v, mode) =>
        mode === 'exact'
          ? `//${tagName}[@aria-label=${escapeXPathLiteral(v)}]`
          : `//${tagName}[contains(@aria-label,${escapeXPathLiteral(v)})]`
    );
  }

  if (attributes.ariaLabelledBy) {
    variants.push(makeVariant({
      tier: 2,
      strategy: 'accessibility',
      variantType: 'exact',
      isRelational: false,
      xpath: `//${tagName}[@aria-labelledby and normalize-space()=${escapeXPathLiteral(attributes.ariaLabelledBy)}]`,
    }));
    variants.push(makeVariant({
      tier: 2,
      strategy: 'accessibility',
      variantType: 'exact',
      isRelational: false,
      xpath: `//${tagName}[normalize-space()=${escapeXPathLiteral(attributes.ariaLabelledBy)}]`,
    }));
  }

  if (attributes.role) {
    const roleExpr = `[@role=${escapeXPathLiteral(attributes.role)}]`;
    if (attributes.ariaLabel) {
      variants.push(makeVariant({
        tier: 2,
        strategy: 'accessibility',
        variantType: 'exact',
        isRelational: false,
        xpath: `//${tagName}${roleExpr}[@aria-label=${escapeXPathLiteral(attributes.ariaLabel)}]`,
      }));
    } else {
      variants.push(makeVariant({
        tier: 2,
        strategy: 'accessibility',
        variantType: 'exact',
        isRelational: false,
        xpath: `//${tagName}${roleExpr}`,
      }));
    }
  }

  return variants;
}

function tier3Id(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { attributes } = ctx;
  if (!attributes.id) return variants;

  addExactAndGeneralized(
    variants,
    { tier: 3, strategy: 'id', isRelational: false, css: `#${attributes.id}` },
    attributes.id,
    (v, mode) =>
      mode === 'exact'
        ? `//*[@id=${escapeXPathLiteral(v)}]`
        : `//*[contains(@id,${escapeXPathLiteral(v)})]`
  );

  const analysis = detectDynamicValue(attributes.id);
  if (analysis.isDynamic && analysis.stablePrefix) {
    variants.push(makeVariant({
      tier: 3,
      strategy: 'id',
      variantType: 'generalized',
      isRelational: false,
      xpath: `//*[starts-with(@id,${escapeXPathLiteral(analysis.stablePrefix)})]`,
    }));
  }

  return variants;
}

function tier4FormAttributes(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, attributes } = ctx;

  const formAttrs: Array<{ key: keyof typeof attributes; attr: string; strategy: LocatorStrategy }> = [
    { key: 'name', attr: 'name', strategy: 'formAttribute' },
    { key: 'placeholder', attr: 'placeholder', strategy: 'formAttribute' },
    { key: 'title', attr: 'title', strategy: 'formAttribute' },
    { key: 'alt', attr: 'alt', strategy: 'formAttribute' },
  ];

  for (const { key, attr, strategy } of formAttrs) {
    const value = attributes[key];
    if (!value || typeof value !== 'string') continue;

    addExactAndGeneralized(
      variants,
      { tier: 4, strategy, isRelational: false },
      value,
      (v, mode) =>
        mode === 'exact'
          ? `//${tagName}[@${attr}=${escapeXPathLiteral(v)}]`
          : `//${tagName}[contains(@${attr},${escapeXPathLiteral(v)})]`
    );
  }

  return variants;
}

function tier5Text(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, directText } = ctx;
  if (!directText) return variants;

  variants.push(makeVariant({
    tier: 5,
    strategy: 'text',
    variantType: 'exact',
    isRelational: false,
    xpath: `//${tagName}[normalize-space()=${escapeXPathLiteral(directText)}]`,
    xpathTemplate: `//${tagName}[normalize-space()='\${text}']`,
  }));

  if (directText.length > 3) {
    const partial = directText.slice(0, Math.min(20, directText.length));
    variants.push(makeVariant({
      tier: 5,
      strategy: 'text',
      variantType: 'generalized',
      isRelational: false,
      xpath: `//${tagName}[contains(text(),${escapeXPathLiteral(partial)})]`,
    }));
  }

  return variants;
}

function buildTargetSegment(ctx: ElementContext): string {
  const { tagName, attributes, directText } = ctx;
  const narrowers: string[] = [];

  if (directText) {
    narrowers.push(`[normalize-space()=${escapeXPathLiteral(directText)}]`);
  } else if (attributes.placeholder) {
    narrowers.push(`[@placeholder=${escapeXPathLiteral(attributes.placeholder)}]`);
  } else if (attributes.ariaLabel) {
    narrowers.push(`[@aria-label=${escapeXPathLiteral(attributes.ariaLabel)}]`);
  } else if (attributes.name) {
    narrowers.push(`[@name=${escapeXPathLiteral(attributes.name)}]`);
  }

  if (attributes.testId) {
    return `${tagName}[@data-testid=${escapeXPathLiteral(attributes.testId)}]${narrowers.join('')}`;
  }
  if (attributes.id) {
    return `${tagName}[@id=${escapeXPathLiteral(attributes.id)}]`;
  }
  if (attributes.ariaLabel) {
    return `${tagName}[@aria-label=${escapeXPathLiteral(attributes.ariaLabel)}]`;
  }
  if (directText) {
    return `${tagName}[normalize-space()=${escapeXPathLiteral(directText)}]`;
  }
  return tagName;
}

function buildAncestorXPath(ancestor: ElementContext['ancestors'][number]): string {
  if (ancestor.testId && !isGenericTestId(ancestor.testId)) {
    return `//${ancestor.tagName}[@data-testid=${escapeXPathLiteral(ancestor.testId)}]`;
  }
  if (ancestor.id) {
    return `//${ancestor.tagName}[@id=${escapeXPathLiteral(ancestor.id)}]`;
  }
  if (ancestor.ariaLabel) {
    return `//${ancestor.tagName}[@aria-label=${escapeXPathLiteral(ancestor.ariaLabel)}]`;
  }
  return `//${ancestor.tagName}`;
}

function tier6AncestorScoped(ctx: ElementContext, pageContext: VariantPageContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, directText, attributes, ancestors } = ctx;
  const testId = attributes.testId;
  const testIdCount = testId ? (pageContext.testIdCounts.get(testId) ?? 0) : 0;
  const needsScope = (testId && (isGenericTestId(testId) || testIdCount > 1)) || !testId;

  if (!needsScope && ancestors.length === 0) return variants;

  for (const ancestor of ancestors) {
    if (!ancestor.testId && !ancestor.id && !ancestor.ariaLabel) continue;
    if (ancestor.testId && isGenericTestId(ancestor.testId)) continue;

    const ancestorXPath = buildAncestorXPath(ancestor);
    const targetSegment = buildTargetSegment(ctx);
    variants.push(makeVariant({
      tier: 6,
      strategy: 'ancestorScoped',
      variantType: 'exact',
      isRelational: true,
      xpath: `${ancestorXPath}//${targetSegment}`,
    }));

    if (directText) {
      variants.push(makeVariant({
        tier: 6,
        strategy: 'ancestorScoped',
        variantType: 'exact',
        isRelational: true,
        xpath: `${ancestorXPath}//${tagName}[normalize-space()=${escapeXPathLiteral(directText)}]`,
      }));
    }
  }

  return variants;
}

function tier7LabelSibling(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, precedingLabel } = ctx;
  if (!precedingLabel) return variants;

  variants.push(makeVariant({
    tier: 7,
    strategy: 'labelSibling',
    variantType: 'exact',
    isRelational: true,
    xpath: `//label[normalize-space()=${escapeXPathLiteral(precedingLabel)}]/following-sibling::${tagName}[1]`,
  }));

  variants.push(makeVariant({
    tier: 7,
    strategy: 'labelSibling',
    variantType: 'exact',
    isRelational: true,
    xpath: `//label[text()=${escapeXPathLiteral(precedingLabel)}]/following-sibling::${tagName}[1]`,
  }));

  variants.push(makeVariant({
    tier: 7,
    strategy: 'labelSibling',
    variantType: 'exact',
    isRelational: true,
    xpath: `//label[normalize-space()=${escapeXPathLiteral(precedingLabel)}]/following-sibling::*[1]//${tagName}`,
  }));

  return variants;
}

function tier8GenericMatch(ctx: ElementContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, attributes } = ctx;

  for (const [attrName, value] of Object.entries(attributes.testingAttributes)) {
    const analysis = detectDynamicValue(value);
    if (analysis.isDynamic && analysis.stablePrefix) {
      variants.push(makeVariant({
        tier: 8,
        strategy: 'genericMatch',
        variantType: 'generalized',
        isRelational: false,
        xpath: `//*[contains(@${attrName},${escapeXPathLiteral(analysis.stablePrefix)})]`,
      }));
    }
  }

  if (attributes.id) {
    const analysis = detectDynamicValue(attributes.id);
    if (analysis.isDynamic && analysis.stablePrefix) {
      variants.push(makeVariant({
        tier: 8,
        strategy: 'genericMatch',
        variantType: 'generalized',
        isRelational: false,
        xpath: `//*[starts-with(@id,${escapeXPathLiteral(analysis.stablePrefix)})]`,
      }));
    }
  }

  if (
    attributes.className &&
    !isUnstableClass(attributes.className) &&
    !attributes.testId &&
    !attributes.id
  ) {
    const firstClass = attributes.className.trim().split(/\s+/)[0];
    variants.push(makeVariant({
      tier: 8,
      strategy: 'class',
      variantType: 'exact',
      isRelational: false,
      xpath: `//${tagName}[contains(@class,${escapeXPathLiteral(firstClass)})]`,
      css: `.${firstClass}`,
    }));
  }

  if (attributes.href && tagName === 'a') {
    const analysis = detectDynamicValue(attributes.href);
    if (analysis.isDynamic && analysis.stablePrefix) {
      variants.push(makeVariant({
        tier: 8,
        strategy: 'genericMatch',
        variantType: 'generalized',
        isRelational: false,
        xpath: `//a[contains(@href,${escapeXPathLiteral(analysis.stablePrefix)})]`,
      }));
    }
  }

  return variants;
}

function tier9Positional(ctx: ElementContext, pageContext: VariantPageContext): XPathVariant[] {
  const variants: XPathVariant[] = [];
  const { tagName, attributes, siblingIndex } = ctx;
  const testId = attributes.testId;

  if (testId && siblingIndex !== null) {
    variants.push(makeVariant({
      tier: 9,
      strategy: 'positional',
      variantType: 'exact',
      isRelational: true,
      xpath: `(//*[@data-testid=${escapeXPathLiteral(testId)}])[${siblingIndex}]`,
    }));
  }

  if (siblingIndex !== null) {
    variants.push(makeVariant({
      tier: 9,
      strategy: 'positional',
      variantType: 'exact',
      isRelational: true,
      xpath: `(//${tagName})[${siblingIndex}]`,
    }));
  }

  if (testId && (pageContext.testIdCounts.get(testId) ?? 0) > 1) {
    variants.push(makeVariant({
      tier: 9,
      strategy: 'positional',
      variantType: 'exact',
      isRelational: true,
      xpath: `(//*[@data-testid=${escapeXPathLiteral(testId)}])[1]`,
    }));
  }

  return variants;
}

function dedupeVariants(variants: XPathVariant[]): XPathVariant[] {
  const seen = new Set<string>();
  return variants.filter((v) => {
    if (seen.has(v.xpath)) return false;
    seen.add(v.xpath);
    return true;
  });
}

export function buildTestIdFrequencyMap(contexts: ElementContext[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ctx of contexts) {
    const testId = ctx.attributes.testId;
    if (testId) {
      counts.set(testId, (counts.get(testId) ?? 0) + 1);
    }
  }
  return counts;
}

export function generateAllXPathVariants(
  ctx: ElementContext,
  pageContext: VariantPageContext
): XPathVariant[] {
  const tiers: XPathTier[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const generators: Array<(c: ElementContext, p: VariantPageContext) => XPathVariant[]> = [
    tier1TestingAttributes,
    tier2Accessibility,
    tier3Id,
    tier4FormAttributes,
    tier5Text,
    tier6AncestorScoped,
    tier7LabelSibling,
    tier8GenericMatch,
    tier9Positional,
  ];

  const variants: XPathVariant[] = [];
  for (let i = 0; i < tiers.length; i++) {
    variants.push(...generators[i](ctx, pageContext));
  }

  return dedupeVariants(variants);
}
