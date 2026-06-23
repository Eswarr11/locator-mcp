import { ElementAttributes, AncestorContext } from './scanner.types.js';
import { GENERIC_TEST_IDS, KEY_ATTRIBUTE_PRIORITY } from '../shared/constants.js';
import { toCamelCase } from '../shared/utils.js';

interface GenerateKeyInput {
  attributes: ElementAttributes;
  tagName: string;
  text: string | null;
  index: number;
  ancestors?: AncestorContext[];
}

function normalizeTestId(testId: string): string {
  return testId.replace(/-\d{3,}/g, '');
}

function keyFromAttribute(
  attributes: ElementAttributes,
  attr: (typeof KEY_ATTRIBUTE_PRIORITY)[number]
): string | null {
  switch (attr) {
    case 'testId':
      return attributes.testId ? toCamelCase(normalizeTestId(attributes.testId)) : null;
    case 'id':
      return attributes.id ? toCamelCase(attributes.id) : null;
    case 'ariaLabel':
      return attributes.ariaLabel ? toCamelCase(attributes.ariaLabel.slice(0, 50)) : null;
    case 'placeholder':
      return attributes.placeholder ? toCamelCase(attributes.placeholder.slice(0, 50)) : null;
    case 'name':
      return attributes.name ? toCamelCase(attributes.name) : null;
    case 'title':
      return attributes.title ? toCamelCase(attributes.title.slice(0, 50)) : null;
    case 'alt':
      return attributes.alt ? toCamelCase(attributes.alt.slice(0, 50)) : null;
    case 'href': {
      if (!attributes.href) return null;
      const segment = attributes.href.split('/').filter(Boolean).pop() ?? attributes.href;
      return toCamelCase(segment.slice(0, 50));
    }
    default:
      return null;
  }
}

export function generateKey({
  attributes,
  tagName,
  text,
  index,
  ancestors = [],
}: GenerateKeyInput): string {
  const isGeneric = attributes.testId !== null && GENERIC_TEST_IDS.has(attributes.testId);

  if (isGeneric) {
    const anchor = ancestors.find(
      (a) => a.testId && !GENERIC_TEST_IDS.has(a.testId)
    );
    if (anchor?.testId) {
      const anchorKey = toCamelCase(normalizeTestId(anchor.testId));
      const rawSuffix = text
        ? toCamelCase(text.slice(0, 30))
        : toCamelCase(tagName);
      const suffix = rawSuffix.charAt(0).toUpperCase() + rawSuffix.slice(1);
      const key = `${anchorKey}${suffix}`;
      if (key) return key;
    }
    if (text) {
      const key = toCamelCase(`${attributes.testId}-${text.slice(0, 30)}`);
      if (key) return key;
    }
  }

  if (attributes.testId) {
    const key = keyFromAttribute(attributes, 'testId');
    return key || `${tagName}${index}`;
  }

  for (const attr of KEY_ATTRIBUTE_PRIORITY.slice(1)) {
    const key = keyFromAttribute(attributes, attr);
    if (key) return key;
  }

  if (text) {
    const key = toCamelCase(text.slice(0, 50));
    return key || `${tagName}${index}`;
  }

  return `${tagName}${index}`;
}
