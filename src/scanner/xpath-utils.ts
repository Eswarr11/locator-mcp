import { HASH_CLASS_PATTERNS } from '../shared/constants.js';

export function escapeXPathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'");
  return `concat('${parts.join(`', "'", '`)}')`;
}

export function isUnstableClass(className: string): boolean {
  const firstClass = className.trim().split(/\s+/)[0];
  if (!firstClass) return true;
  return HASH_CLASS_PATTERNS.some((pattern) => pattern.test(firstClass));
}
