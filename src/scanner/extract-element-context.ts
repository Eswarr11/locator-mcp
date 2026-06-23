import { Page } from '@playwright/test';
import { IGNORED_TAGS, MAX_ANCESTOR_DEPTH, TESTING_ATTRIBUTE_NAMES } from '../shared/constants.js';
import { ElementContext } from './scanner.types.js';

interface ExtractContextOptions {
  selector: string;
}

function extractContextInBrowser(options: {
  selector: string;
  maxDepth: number;
  ignoredTags: string[];
  testingAttributeNames: string[];
}): ElementContext[] {
  const { selector, maxDepth, ignoredTags, testingAttributeNames } = options;
  const ignored = new Set(ignoredTags);

  function getDirectText(el: Element): string | null {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    return text || null;
  }

  function getTestingAttributes(el: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const name of testingAttributeNames) {
      const value = el.getAttribute(name);
      if (value) attrs[name] = value;
    }
    return attrs;
  }

  function resolveAriaLabelledBy(el: Element): string | null {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (!labelledBy) return null;

    const texts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);

    return texts.length > 0 ? texts.join(' ') : null;
  }

  function getAttributes(el: Element) {
    const testingAttributes = getTestingAttributes(el);
    return {
      testId: testingAttributes['data-testid'] ?? el.getAttribute('data-testid'),
      id: el.getAttribute('id'),
      className: el.getAttribute('class'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      ariaLabelledBy: resolveAriaLabelledBy(el),
      placeholder: el.getAttribute('placeholder'),
      name: el.getAttribute('name'),
      title: el.getAttribute('title'),
      alt: el.getAttribute('alt'),
      type: el.getAttribute('type'),
      href: el.getAttribute('href'),
      contentEditable: el.getAttribute('contenteditable'),
      testingAttributes,
    };
  }

  function getAncestors(el: Element) {
    const ancestors = [];
    let current = el.parentElement;
    let depth = 0;

    while (current && depth < maxDepth) {
      ancestors.push({
        tagName: current.tagName.toLowerCase(),
        testId: current.getAttribute('data-testid'),
        id: current.getAttribute('id'),
        role: current.getAttribute('role'),
        ariaLabel: current.getAttribute('aria-label'),
      });
      current = current.parentElement;
      depth++;
    }

    return ancestors;
  }

  function getPrecedingLabel(el: Element): string | null {
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent?.trim()) {
        return label.textContent.trim();
      }
    }

    let sibling = el.previousElementSibling;
    while (sibling) {
      const tag = sibling.tagName;
      if (tag === 'LABEL' || tag === 'LEGEND') {
        const text = sibling.textContent?.trim();
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }

    const parent = el.parentElement;
    if (parent?.tagName === 'LABEL') {
      const clone = parent.cloneNode(true) as Element;
      for (const child of [...clone.children]) {
        child.remove();
      }
      const text = clone.textContent?.trim();
      if (text) return text;
    }

    return null;
  }

  function getSiblingIndex(el: Element): number | null {
    const parent = el.parentElement;
    if (!parent) return null;

    const sameTagSiblings = [...parent.children].filter(
      (child) => child.tagName === el.tagName
    );
    if (sameTagSiblings.length <= 1) return null;

    const index = sameTagSiblings.indexOf(el);
    return index >= 0 ? index + 1 : null;
  }

  const elements = document.querySelectorAll(selector);
  const results: ElementContext[] = [];

  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (ignored.has(tagName)) continue;

    results.push({
      tagName,
      directText: getDirectText(el),
      attributes: getAttributes(el),
      ancestors: getAncestors(el),
      precedingLabel: getPrecedingLabel(el),
      siblingIndex: getSiblingIndex(el),
    });
  }

  return results;
}

export async function extractAllElementContexts(
  page: Page,
  options: ExtractContextOptions
): Promise<ElementContext[]> {
  return page.evaluate(extractContextInBrowser, {
    selector: options.selector,
    maxDepth: MAX_ANCESTOR_DEPTH,
    ignoredTags: [...IGNORED_TAGS],
    testingAttributeNames: [...TESTING_ATTRIBUTE_NAMES],
  });
}
