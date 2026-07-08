import { GENERIC_TEST_IDS, MAX_SEMANTIC_FILTERS, SEMANTIC_PRIORITY } from '../shared/constants.js';
import {
  ChildHint,
  ElementContext,
  LocatorFilter,
  SemanticStrategy,
} from './scanner.types.js';
import { isUnstableClass } from './xpath-utils.js';

export interface SemanticCandidate {
  locator: string;
  strategy: SemanticStrategy;
  priority: number;
  filters: LocatorFilter[];
}

export interface SemanticLocatorResult {
  primary: string;
  alternatives: string[];
  filters: LocatorFilter[];
  strategy: SemanticStrategy;
  priority: number;
}

const IMPLICIT_ROLES: Record<string, string> = {
  button: 'button',
  a: 'link',
  textarea: 'textbox',
  select: 'combobox',
  img: 'img',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
};

const INPUT_TYPE_ROLES: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  text: 'textbox',
  email: 'textbox',
  password: 'textbox',
  search: 'searchbox',
  tel: 'textbox',
  url: 'textbox',
  number: 'spinbutton',
};

export function escapeLocatorString(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `'${value.replace(/'/g, "\\'")}'`;
}

export function buildFilteredLocator(baseLocator: string, filters: LocatorFilter[]): string {
  if (filters.length === 0) {
    return baseLocator;
  }

  return filters.reduce(
    (current, filter) => `${current}.filter({ ${filter.type}: ${filter.locator} })`,
    baseLocator
  );
}

function resolveImplicitRole(ctx: ElementContext): string | null {
  const { tagName, attributes } = ctx;
  if (attributes.role) {
    return attributes.role;
  }

  if (tagName === 'input' && attributes.type) {
    return INPUT_TYPE_ROLES[attributes.type] ?? 'textbox';
  }

  return IMPLICIT_ROLES[tagName] ?? null;
}

function resolveAccessibleName(ctx: ElementContext): string | null {
  const { attributes, directText, precedingLabel, tagName } = ctx;

  if (attributes.ariaLabel) {
    return attributes.ariaLabel;
  }
  if (attributes.ariaLabelledBy) {
    return attributes.ariaLabelledBy;
  }
  if (precedingLabel) {
    return precedingLabel;
  }
  if (directText) {
    return directText;
  }
  if (attributes.alt && (tagName === 'img' || tagName === 'area')) {
    return attributes.alt;
  }
  if (attributes.title) {
    return attributes.title;
  }
  if (attributes.placeholder && (ctx.tagName === 'input' || ctx.tagName === 'textarea')) {
    return attributes.placeholder;
  }

  return null;
}

function resolveTestIdValue(ctx: ElementContext): string | null {
  return ctx.attributes.testId ?? ctx.attributes.testingAttributes['data-testid'] ?? null;
}

function buildByRoleLocator(ctx: ElementContext): SemanticCandidate | null {
  const role = resolveImplicitRole(ctx);
  if (!role) {
    return null;
  }

  if (role === 'img' && ctx.attributes.alt) {
    return null;
  }

  const name = resolveAccessibleName(ctx);
  const roleArg = escapeLocatorString(role);
  const locator = name
    ? `getByRole(${roleArg}, { name: ${escapeLocatorString(name)} })`
    : `getByRole(${roleArg})`;

  return {
    locator,
    strategy: 'byRole',
    priority: SEMANTIC_PRIORITY.byRole,
    filters: [],
  };
}

function buildByLabelLocator(ctx: ElementContext): SemanticCandidate | null {
  const label = ctx.precedingLabel ?? ctx.attributes.ariaLabelledBy;
  const formTags = new Set(['input', 'textarea', 'select', 'output']);
  if (!label || !formTags.has(ctx.tagName)) {
    return null;
  }

  return {
    locator: `getByLabel(${escapeLocatorString(label)})`,
    strategy: 'byLabel',
    priority: SEMANTIC_PRIORITY.byLabel,
    filters: [],
  };
}

function buildByPlaceholderLocator(ctx: ElementContext): SemanticCandidate | null {
  const { placeholder } = ctx.attributes;
  if (!placeholder) {
    return null;
  }

  return {
    locator: `getByPlaceholder(${escapeLocatorString(placeholder)})`,
    strategy: 'byPlaceholder',
    priority: SEMANTIC_PRIORITY.byPlaceholder,
    filters: [],
  };
}

function buildByTextLocator(ctx: ElementContext): SemanticCandidate | null {
  const text = ctx.directText;
  if (!text || text.length > 80) {
    return null;
  }

  return {
    locator: `getByText(${escapeLocatorString(text)})`,
    strategy: 'byText',
    priority: SEMANTIC_PRIORITY.byText,
    filters: [],
  };
}

function buildByAltTextLocator(ctx: ElementContext): SemanticCandidate | null {
  const { alt } = ctx.attributes;
  if (!alt) {
    return null;
  }

  return {
    locator: `getByAltText(${escapeLocatorString(alt)})`,
    strategy: 'byAltText',
    priority: SEMANTIC_PRIORITY.byAltText,
    filters: [],
  };
}

function buildByTitleLocator(ctx: ElementContext): SemanticCandidate | null {
  const { title } = ctx.attributes;
  if (!title) {
    return null;
  }

  return {
    locator: `getByTitle(${escapeLocatorString(title)})`,
    strategy: 'byTitle',
    priority: SEMANTIC_PRIORITY.byTitle,
    filters: [],
  };
}

function buildByTestIdLocator(ctx: ElementContext): SemanticCandidate | null {
  const testId = resolveTestIdValue(ctx);
  if (!testId) {
    return null;
  }

  return {
    locator: `getByTestId(${escapeLocatorString(testId)})`,
    strategy: 'byTestId',
    priority: SEMANTIC_PRIORITY.byTestId,
    filters: [],
  };
}

function buildCssLocator(ctx: ElementContext): SemanticCandidate | null {
  const { id, className } = ctx.attributes;

  if (id) {
    return {
      locator: `locator(${escapeLocatorString(`#${id}`)})`,
      strategy: 'cssLocator',
      priority: SEMANTIC_PRIORITY.cssLocator,
      filters: [],
    };
  }

  if (className && !isUnstableClass(className)) {
    const firstClass = className.trim().split(/\s+/)[0];
    if (firstClass) {
      return {
        locator: `locator(${escapeLocatorString(`.${firstClass}`)})`,
        strategy: 'cssLocator',
        priority: SEMANTIC_PRIORITY.cssLocator,
        filters: [],
      };
    }
  }

  return null;
}

function buildXPathLocator(xpath?: string): SemanticCandidate | null {
  if (!xpath) {
    return null;
  }

  return {
    locator: `locator(${escapeLocatorString(`xpath=${xpath}`)})`,
    strategy: 'xpathLocator',
    priority: SEMANTIC_PRIORITY.xpathLocator,
    filters: [],
  };
}

function buildChildLocator(hint: ChildHint): string | null {
  if (hint.id) {
    return `locator(${escapeLocatorString(`#${hint.id}`)})`;
  }
  if (hint.testId) {
    return `getByTestId(${escapeLocatorString(hint.testId)})`;
  }
  if (hint.role && hint.ariaLabel) {
    return `getByRole(${escapeLocatorString(hint.role)}, { name: ${escapeLocatorString(hint.ariaLabel)} })`;
  }
  return null;
}

function buildAncestorBaseLocator(ctx: ElementContext): SemanticCandidate | null {
  for (const ancestor of ctx.ancestors) {
    if (ancestor.testId && !GENERIC_TEST_IDS.has(ancestor.testId)) {
      return {
        locator: `getByTestId(${escapeLocatorString(ancestor.testId)})`,
        strategy: 'byTestId',
        priority: SEMANTIC_PRIORITY.byTestId,
        filters: [],
      };
    }
    if (ancestor.id) {
      return {
        locator: `locator(${escapeLocatorString(`#${ancestor.id}`)})`,
        strategy: 'cssLocator',
        priority: SEMANTIC_PRIORITY.cssLocator,
        filters: [],
      };
    }
    if (ancestor.role && ancestor.ariaLabel) {
      return {
        locator: `getByRole(${escapeLocatorString(ancestor.role)}, { name: ${escapeLocatorString(ancestor.ariaLabel)} })`,
        strategy: 'byRole',
        priority: SEMANTIC_PRIORITY.byRole,
        filters: [],
      };
    }
  }

  for (const ancestor of ctx.ancestors) {
    if (ancestor.testId) {
      return {
        locator: `getByTestId(${escapeLocatorString(ancestor.testId)})`,
        strategy: 'byTestId',
        priority: SEMANTIC_PRIORITY.byTestId,
        filters: [],
      };
    }
  }

  return null;
}

function buildTargetSuffix(ctx: ElementContext): string | null {
  const testId = resolveTestIdValue(ctx);
  if (testId) {
    return `getByTestId(${escapeLocatorString(testId)})`;
  }

  const role = resolveImplicitRole(ctx);
  const name = resolveAccessibleName(ctx);
  if (role && name) {
    return `getByRole(${escapeLocatorString(role)}, { name: ${escapeLocatorString(name)} })`;
  }
  if (role) {
    return `getByRole(${escapeLocatorString(role)})`;
  }

  if (ctx.precedingLabel) {
    return `getByLabel(${escapeLocatorString(ctx.precedingLabel)})`;
  }

  if (ctx.attributes.placeholder) {
    return `getByPlaceholder(${escapeLocatorString(ctx.attributes.placeholder)})`;
  }

  if (ctx.directText) {
    return `getByText(${escapeLocatorString(ctx.directText)})`;
  }

  return null;
}

export function generateFilterChain(
  ctx: ElementContext,
  _baseLocator: string,
  matchCount: number
): LocatorFilter[] {
  if (matchCount <= 1) {
    return [];
  }

  const filters: LocatorFilter[] = [];
  const childHints = ctx.childHints ?? [];

  for (const hint of childHints) {
    if (filters.length >= MAX_SEMANTIC_FILTERS) {
      break;
    }

    const childLocator = buildChildLocator(hint);
    if (childLocator) {
      filters.push({ type: 'has', locator: childLocator });
    }
  }

  if (filters.length < MAX_SEMANTIC_FILTERS) {
    for (const ancestor of ctx.ancestors) {
      if (filters.length >= MAX_SEMANTIC_FILTERS) {
        break;
      }

      if (ancestor.id) {
        filters.push({
          type: 'has',
          locator: `locator(${escapeLocatorString(`#${ancestor.id}`)})`,
        });
        break;
      }
    }
  }

  return filters.slice(0, MAX_SEMANTIC_FILTERS);
}

function buildScopedSemanticLocator(
  ctx: ElementContext,
  target: SemanticCandidate,
  matchCount: number
): SemanticCandidate | null {
  const ancestorBase = buildAncestorBaseLocator(ctx);
  const targetSuffix = buildTargetSuffix(ctx);

  if (!ancestorBase || !targetSuffix) {
    return null;
  }

  const filters = generateFilterChain(ctx, ancestorBase.locator, matchCount);
  const scopedBase = buildFilteredLocator(ancestorBase.locator, filters);
  const locator = `${scopedBase}.${targetSuffix}`;

  return {
    locator,
    strategy: target.strategy,
    priority: target.priority,
    filters,
  };
}

function buildSemanticCandidates(ctx: ElementContext, xpath?: string, css?: string): SemanticCandidate[] {
  const builders = [
    buildByRoleLocator,
    buildByLabelLocator,
    buildByPlaceholderLocator,
    buildByTextLocator,
    buildByAltTextLocator,
    buildByTitleLocator,
    buildByTestIdLocator,
    buildCssLocator,
  ];

  const candidates: SemanticCandidate[] = [];

  for (const builder of builders) {
    const candidate = builder(ctx);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (css && !candidates.some((candidate) => candidate.strategy === 'cssLocator')) {
    candidates.push({
      locator: `locator(${escapeLocatorString(css)})`,
      strategy: 'cssLocator',
      priority: SEMANTIC_PRIORITY.cssLocator,
      filters: [],
    });
  }

  const xpathCandidate = buildXPathLocator(xpath);
  if (xpathCandidate) {
    candidates.push(xpathCandidate);
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}

function dedupeCandidates(candidates: SemanticCandidate[]): SemanticCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.locator)) {
      return false;
    }
    seen.add(candidate.locator);
    return true;
  });
}

export function generateSemanticLocator(
  ctx: ElementContext,
  matchCount: number,
  options: { xpath?: string; css?: string } = {}
): SemanticLocatorResult | null {
  const baseCandidates = dedupeCandidates(buildSemanticCandidates(ctx, options.xpath, options.css));
  if (baseCandidates.length === 0) {
    return null;
  }

  const enrichedCandidates: SemanticCandidate[] = [];

  for (const candidate of baseCandidates) {
    enrichedCandidates.push(candidate);

    if (matchCount > 1) {
      const filters = generateFilterChain(ctx, candidate.locator, matchCount);
      if (filters.length > 0) {
        enrichedCandidates.push({
          ...candidate,
          locator: buildFilteredLocator(candidate.locator, filters),
          filters,
        });
      }

      const scoped = buildScopedSemanticLocator(ctx, candidate, matchCount);
      if (scoped) {
        enrichedCandidates.push(scoped);
      }
    }
  }

  const ranked = dedupeCandidates(enrichedCandidates).sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.filters.length - a.filters.length;
  });

  const primary = ranked[0]!;
  const alternatives = ranked.slice(1, 6).map((candidate) => candidate.locator);

  return {
    primary: primary.locator,
    alternatives,
    filters: primary.filters,
    strategy: primary.strategy,
    priority: primary.priority,
  };
}

export function enrichLocatorsWithSemantic(
  locators: import('./scanner.types.js').LocatorTemplates,
  ctx: ElementContext
): import('./scanner.types.js').LocatorTemplates {
  const matchCount = locators.matchCount ?? locators.recommended?.matchCount ?? 1;
  const semanticResult = generateSemanticLocator(ctx, matchCount, {
    xpath: locators.recommended?.xpath ?? locators.xpath,
    css: locators.recommended?.css ?? locators.css,
  });

  if (!semanticResult) {
    return locators;
  }

  const recommended = locators.recommended
    ? {
        ...locators.recommended,
        semanticLocator: semanticResult.primary,
        semanticStrategy: semanticResult.strategy,
        semanticPriority: semanticResult.priority,
        semanticFilters: semanticResult.filters,
      }
    : undefined;

  return {
    ...locators,
    recommended,
    semantic: semanticResult.primary,
    semanticFallbacks: semanticResult.alternatives,
    semanticStrategy: semanticResult.strategy,
    semanticPriority: semanticResult.priority,
  };
}
