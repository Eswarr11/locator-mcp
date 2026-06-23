import { ElementHandle } from '@playwright/test';
import { ElementAttributes } from './scanner.types.js';
import { TESTING_ATTRIBUTE_NAMES } from '../shared/constants.js';

export interface RawElementData {
  tagName: string;
  text: string | null;
  attributes: ElementAttributes;
}

export async function extractAttributes(
  element: ElementHandle<HTMLElement>
): Promise<RawElementData> {
  return element.evaluate((el, testingAttributeNames) => {
    const directText = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');

    const testingAttributes: Record<string, string> = {};
    for (const name of testingAttributeNames as string[]) {
      const value = el.getAttribute(name);
      if (value) testingAttributes[name] = value;
    }

    const labelledBy = el.getAttribute('aria-labelledby');
    let ariaLabelledBy: string | null = null;
    if (labelledBy) {
      const texts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      ariaLabelledBy = texts.length > 0 ? texts.join(' ') : null;
    }

    return {
      tagName: el.tagName.toLowerCase(),
      text: directText || null,
      attributes: {
        testId: testingAttributes['data-testid'] ?? el.getAttribute('data-testid'),
        id: el.getAttribute('id'),
        className: el.getAttribute('class'),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaLabelledBy,
        placeholder: el.getAttribute('placeholder'),
        name: el.getAttribute('name'),
        title: el.getAttribute('title'),
        alt: el.getAttribute('alt'),
        type: el.getAttribute('type'),
        href: el.getAttribute('href'),
        contentEditable: el.getAttribute('contenteditable'),
        testingAttributes,
      },
    };
  }, [...TESTING_ATTRIBUTE_NAMES]);
}
