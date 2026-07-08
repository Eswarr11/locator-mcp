export const TESTING_ATTRIBUTE_NAMES = [
  'data-testid',
  'data-test',
  'data-qa',
  'data-cy',
  'data-test-id',
] as const;

export const FORM_ATTRIBUTE_NAMES = ['name', 'placeholder', 'title', 'alt'] as const;

export type AttributeName =
  | 'testId'
  | 'id'
  | 'className'
  | 'ariaLabel'
  | 'ariaLabelledBy'
  | 'placeholder'
  | 'name'
  | 'title'
  | 'alt'
  | 'href'
  | 'contentEditable';

export interface AttributeDefinition {
  selector: string;
  domAttribute: string;
  key: AttributeName;
}

export const ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  { selector: '[data-testid]', domAttribute: 'data-testid', key: 'testId' },
  { selector: '[data-test]', domAttribute: 'data-test', key: 'testId' },
  { selector: '[data-qa]', domAttribute: 'data-qa', key: 'testId' },
  { selector: '[data-cy]', domAttribute: 'data-cy', key: 'testId' },
  { selector: '[data-test-id]', domAttribute: 'data-test-id', key: 'testId' },
  { selector: '[id]', domAttribute: 'id', key: 'id' },
  { selector: '[class]', domAttribute: 'class', key: 'className' },
  { selector: '[aria-label]', domAttribute: 'aria-label', key: 'ariaLabel' },
  { selector: '[aria-labelledby]', domAttribute: 'aria-labelledby', key: 'ariaLabelledBy' },
  { selector: '[placeholder]', domAttribute: 'placeholder', key: 'placeholder' },
  { selector: '[name]', domAttribute: 'name', key: 'name' },
  { selector: '[title]', domAttribute: 'title', key: 'title' },
  { selector: '[alt]', domAttribute: 'alt', key: 'alt' },
  { selector: '[href]', domAttribute: 'href', key: 'href' },
  { selector: '[contenteditable="true"]', domAttribute: 'contenteditable', key: 'contentEditable' },
];

export const CANDIDATE_SELECTORS = [
  '[data-testid]',
  '[data-test]',
  '[data-qa]',
  '[data-cy]',
  '[data-test-id]',
  '[id]',
  '[class]',
  '[aria-label]',
  '[aria-labelledby]',
  '[placeholder]',
  '[name]',
  '[title]',
  '[alt]',
  '[href]',
  '[contenteditable="true"]',
];

export const CANDIDATE_SELECTOR = CANDIDATE_SELECTORS.join(', ');

export const LOCATOR_ATTRIBUTE_PRIORITY: AttributeName[] = [
  'testId',
  'id',
  'ariaLabel',
  'ariaLabelledBy',
  'placeholder',
  'name',
  'title',
  'alt',
  'href',
  'contentEditable',
  'className',
];

export const KEY_ATTRIBUTE_PRIORITY: AttributeName[] = [
  'testId',
  'id',
  'ariaLabel',
  'placeholder',
  'name',
  'title',
  'alt',
  'href',
];

export const ATTRIBUTE_SELECTOR_MAP = {
  testId: '[data-testid]',
  id: '[id]',
  className: '[class]',
  ariaLabel: '[aria-label]',
  ariaLabelledBy: '[aria-labelledby]',
  placeholder: '[placeholder]',
  name: '[name]',
  title: '[title]',
  alt: '[alt]',
  href: '[href]',
  contentEditable: '[contenteditable="true"]',
} as const;

export const TIER_BASE_SCORES: Record<number, number> = {
  1: 90,
  2: 80,
  3: 70,
  4: 60,
  5: 50,
  6: 40,
  7: 30,
  8: 20,
  9: 10,
};

export const SEMANTIC_PRIORITY: Record<string, number> = {
  byRole: 1,
  byLabel: 2,
  byPlaceholder: 3,
  byText: 4,
  byAltText: 5,
  byTitle: 6,
  byTestId: 7,
  cssLocator: 8,
  xpathLocator: 9,
};

export const SEMANTIC_SCORE_BOOST = 15;

export const MAX_SEMANTIC_FILTERS = 3;

export const MAX_FALLBACK_VARIANTS = 5;

export const XPATH_BATCH_CHUNK_SIZE = 1000;

export const IGNORED_TAGS = new Set([
  'html', 'head', 'body', 'script', 'style',
  'svg', 'path', 'meta', 'link', 'noscript',
]);

export const GENERIC_TEST_IDS = new Set([
  'box', 'flex', 'container', 'wrapper', 'root', 'grid',
]);

export const HASH_CLASS_PATTERNS = [
  /^[a-z]+-c-[A-Z]+/,
  /-[a-zA-Z0-9]{6,}-css$/,
];

export const MAX_ANCESTOR_DEPTH = 6;

export type ScanMode = 'interactive' | 'testId' | 'full';

const INTERACTIVE_ELEMENT_SELECTORS = [
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="combobox"]',
];

const DISCOVERABLE_ATTRIBUTE_SELECTORS = [
  '[data-testid]',
  '[data-test]',
  '[data-qa]',
  '[data-cy]',
  '[aria-label]',
  '[aria-labelledby]',
  '[placeholder]',
  '[name]',
  '[title]',
  '[alt]',
  '[href]',
  '[contenteditable="true"]',
];

export const SCAN_MODE_SELECTORS: Record<ScanMode, string> = {
  interactive: [
    ...INTERACTIVE_ELEMENT_SELECTORS,
    ...DISCOVERABLE_ATTRIBUTE_SELECTORS,
  ].join(', '),
  testId: '[data-testid], [data-test], [data-qa], [data-cy], [data-test-id]',
  full: CANDIDATE_SELECTOR,
};

export const INTERACTIVE_TAGS = new Set([
  'button', 'input', 'textarea', 'select', 'a',
]);

export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox',
]);
