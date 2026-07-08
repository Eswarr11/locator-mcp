import { ElementHandle, Page } from '@playwright/test';
import { ScanMode } from '../shared/constants.js';

export interface ScanOptions {
  scanName?: string;
  scanMode?: ScanMode;
}

export interface ElementAttributes {
  testId: string | null;
  id: string | null;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  placeholder: string | null;
  name: string | null;
  title: string | null;
  alt: string | null;
  type: string | null;
  href: string | null;
  contentEditable: string | null;
  testingAttributes: Record<string, string>;
}

export interface AncestorContext {
  tagName: string;
  testId: string | null;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
}

export interface ElementContext {
  tagName: string;
  directText: string | null;
  attributes: ElementAttributes;
  ancestors: AncestorContext[];
  precedingLabel: string | null;
  siblingIndex: number | null;
  childHints?: ChildHint[];
}

export type XPathTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type LocatorStrategy =
  | 'testingAttribute'
  | 'accessibility'
  | 'testId'
  | 'id'
  | 'formAttribute'
  | 'ancestorScoped'
  | 'labelSibling'
  | 'text'
  | 'class'
  | 'genericMatch'
  | 'positional'
  | 'ariaLabel'
  | 'placeholder'
  | 'name'
  | 'href'
  | 'contentEditable';

export type LocatorConfidence = 'high' | 'medium' | 'low';

export type VariantType = 'exact' | 'generalized';

export type SemanticStrategy =
  | 'byRole'
  | 'byLabel'
  | 'byPlaceholder'
  | 'byText'
  | 'byAltText'
  | 'byTitle'
  | 'byTestId'
  | 'cssLocator'
  | 'xpathLocator';

export interface LocatorFilter {
  type: 'has' | 'hasNot';
  locator: string;
}

export interface ChildHint {
  tagName: string;
  testId: string | null;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
}

export interface XPathVariant {
  xpath: string;
  xpathTemplate?: string;
  tier: XPathTier;
  strategy: LocatorStrategy;
  variantType: VariantType;
  confidenceScore: number;
  matchCount: number;
  isRelational: boolean;
  recommended?: boolean;
  testId?: string;
  css?: string;
  semanticLocator?: string;
  semanticStrategy?: SemanticStrategy;
  semanticPriority?: number;
  semanticFilters?: LocatorFilter[];
}

export interface LocatorTemplates {
  recommended?: XPathVariant;
  fallbacks: XPathVariant[];
  variants?: XPathVariant[];
  testId?: string;
  css?: string;
  xpath?: string;
  xpathRelational?: string;
  xpathTemplate?: string;
  confidence?: LocatorConfidence;
  matchCount?: number;
  strategy?: LocatorStrategy;
  semantic?: string;
  semanticFallbacks?: string[];
  semanticStrategy?: SemanticStrategy;
  semanticPriority?: number;
}

export interface LocatorCandidate {
  xpath: string;
  xpathTemplate?: string;
  testId?: string;
  css?: string;
  confidence: LocatorConfidence;
  strategy: LocatorStrategy;
  isRelational: boolean;
}

export interface ElementMetadata {
  key: string;
  tagName: string;
  text: string | null;
  attributes: ElementAttributes;
  locators: LocatorTemplates;
  aliases?: string[];
}

export interface ScanStats {
  total: number;
  unique: number;
  duplicate: number;
  lowConfidence: number;
  interactive: number;
}

export interface ScanTimings {
  extractMs: number;
  generateMs: number;
  validateMs: number;
  rankMs: number;
  saveMs: number;
  totalMs: number;
}

export interface ScanResult {
  scanId: string;
  pageUrl: string;
  scannedAt: string;
  totalElements: number;
  elements: ElementMetadata[];
  stats: ScanStats;
  warnings: string[];
  registryFile: string;
  timings?: ScanTimings;
}

export type LocatorRegistry = Record<string, ElementMetadata>;

export type DiscoverElements = (
  page: Page,
  scanMode?: ScanMode
) => Promise<ElementHandle<HTMLElement>[]>;

export type SaveRegistry = (
  registry: LocatorRegistry,
  scanName: string
) => Promise<void>;

export interface VariantPageContext {
  testIdCounts: Map<string, number>;
}
