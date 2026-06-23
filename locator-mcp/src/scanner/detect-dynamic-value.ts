export interface DynamicAnalysis {
  isDynamic: boolean;
  stablePrefix: string | null;
  stableSuffix: string | null;
  templateVar: string | null;
  variantType: 'exact' | 'generalized';
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const RADIX_PATTERN = /radix-|:r\d+:|react-aria/i;
const LONG_NUMERIC_PATTERN = /\d{10,}/;
const NUMERIC_SUFFIX_PATTERN = /-\d{3,}/;
const HASH_SUFFIX_PATTERN = /[._-][a-f0-9]{8,}$/i;

function inferTemplateVar(value: string, prefix: string): string {
  const segs = prefix.split(/[-_]/).filter((s) => s && !/^\d+$/.test(s));
  const prevSeg = segs.at(-1) ?? 'item';
  return `${prefix}\${${prevSeg.toLowerCase()}Id}`;
}

export function detectDynamicValue(value: string): DynamicAnalysis {
  if (!value) {
    return {
      isDynamic: false,
      stablePrefix: null,
      stableSuffix: null,
      templateVar: null,
      variantType: 'exact',
    };
  }

  if (UUID_PATTERN.test(value)) {
    const prefix = value.split(UUID_PATTERN)[0] || null;
    return {
      isDynamic: true,
      stablePrefix: prefix,
      stableSuffix: null,
      templateVar: prefix ? inferTemplateVar(value, prefix) : '${id}',
      variantType: 'generalized',
    };
  }

  if (RADIX_PATTERN.test(value)) {
    const prefix = value.split(RADIX_PATTERN)[0] || null;
    return {
      isDynamic: true,
      stablePrefix: prefix,
      stableSuffix: null,
      templateVar: '${radixId}',
      variantType: 'generalized',
    };
  }

  if (NUMERIC_SUFFIX_PATTERN.test(value) || LONG_NUMERIC_PATTERN.test(value)) {
    const prefixMatch = value.match(/^(.*?-)\d{3,}/);
    const prefix = prefixMatch?.[1] ?? (value.match(/^(\D+)\d+/)?.[1] ?? null);
    return {
      isDynamic: true,
      stablePrefix: prefix,
      stableSuffix: null,
      templateVar: prefix ? inferTemplateVar(value, prefix) : '${id}',
      variantType: 'generalized',
    };
  }

  if (HASH_SUFFIX_PATTERN.test(value)) {
    const prefix = value.replace(HASH_SUFFIX_PATTERN, '');
    return {
      isDynamic: true,
      stablePrefix: prefix,
      stableSuffix: null,
      templateVar: '${hashId}',
      variantType: 'generalized',
    };
  }

  return {
    isDynamic: false,
    stablePrefix: null,
    stableSuffix: null,
    templateVar: null,
    variantType: 'exact',
  };
}

export function isDynamicValue(value: string): boolean {
  return detectDynamicValue(value).isDynamic;
}
