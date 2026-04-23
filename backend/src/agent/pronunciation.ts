// Phonetic control for the TTS layer.
//
// Two kinds of rules:
//  • "ipa"    — wraps the match in `<phoneme alphabet="ipa" ph="...">`.
//               Only rendered for models that support phoneme SSML tags:
//               eleven_turbo_v2, eleven_flash_v2, eleven_english_v1.
//               For any other model, falls back to emitting the raw word.
//  • "alias"  — plain text substitution. Works on every model. Use this for
//               shorthand the model reads letter-by-letter (PRN, DNR, O2 sat).
//
// Matching is whole-word, case-insensitive. Multi-word phrases are tried
// before their single-word substrings.

interface IpaRule {
  kind: 'ipa';
  term: string;
  ipa: string;
}
interface AliasRule {
  kind: 'alias';
  term: string;
  alias: string;
}
type Rule = IpaRule | AliasRule;

const RULES: Rule[] = [
  // ── Respiratory / pediatric ─────────────────────────────────
  { kind: 'ipa', term: 'albuterol',   ipa: 'ælˈbjuːtəˌrɒl' },
  { kind: 'ipa', term: 'budesonide',  ipa: 'bjuːˈdɛsəˌnaɪd' },
  { kind: 'ipa', term: 'ipratropium', ipa: 'ɪprəˈtroʊpiəm' },

  // ── GI ──────────────────────────────────────────────────────
  { kind: 'ipa', term: 'ranitidine',           ipa: 'rəˈnɪtəˌdin' },
  { kind: 'ipa', term: 'famotidine',           ipa: 'fəˈmoʊtəˌdin' },
  { kind: 'ipa', term: 'polyethylene glycol',  ipa: 'ˌpɒliˈɛθəˌlin ˈɡlaɪˌkɒl' },
  { kind: 'ipa', term: 'ondansetron',          ipa: 'ɒnˈdænsəˌtrɒn' },
  { kind: 'ipa', term: 'metoclopramide',       ipa: 'ˌmɛtəˈkloʊprəˌmaɪd' },

  // ── Neuro / cerebral palsy ──────────────────────────────────
  { kind: 'ipa', term: 'baclofen',       ipa: 'ˈbæklɵˌfɛn' },
  { kind: 'ipa', term: 'diazepam',       ipa: 'daɪˈæzəˌpæm' },
  { kind: 'ipa', term: 'levetiracetam',  ipa: 'lɛˌvɛtɪˈræsəˌtæm' },
  { kind: 'ipa', term: 'gabapentin',     ipa: 'ˈɡæbəˌpɛntɪn' },
  { kind: 'ipa', term: 'glycopyrrolate', ipa: 'ˌɡlaɪkoʊˈpɪrəˌleɪt' },
  { kind: 'ipa', term: 'clonazepam',     ipa: 'kloʊˈnæzəˌpæm' },
  { kind: 'ipa', term: 'topiramate',     ipa: 'toʊˈpɪrəˌmeɪt' },

  // ── Cardiac ─────────────────────────────────────────────────
  { kind: 'ipa', term: 'metoprolol',     ipa: 'mɪˈtɒprəˌlɒl' },
  { kind: 'ipa', term: 'furosemide',     ipa: 'fjʊˈroʊsəˌmaɪd' },
  { kind: 'ipa', term: 'lisinopril',     ipa: 'laɪˈsɪnəˌprɪl' },
  { kind: 'ipa', term: 'amlodipine',     ipa: 'æmˈloʊdəˌpin' },
  { kind: 'ipa', term: 'spironolactone', ipa: 'ˌspɪrənoʊˈlækˌtoʊn' },
  { kind: 'ipa', term: 'clopidogrel',    ipa: 'kloʊˈpɪdəˌɡrɛl' },

  // ── Pain / antibiotics / common ─────────────────────────────
  { kind: 'ipa', term: 'acetaminophen',  ipa: 'əˌsiːtəˈmɪnəfən' },
  { kind: 'ipa', term: 'ibuprofen',      ipa: 'ˌaɪbjuˈproʊfən' },
  { kind: 'ipa', term: 'amoxicillin',    ipa: 'əˌmɒksəˈsɪlən' },
  { kind: 'ipa', term: 'azithromycin',   ipa: 'əˌzɪθrəˈmaɪsən' },
  { kind: 'ipa', term: 'cephalexin',     ipa: 'ˌsɛfəˈlɛksən' },
  { kind: 'ipa', term: 'melatonin',      ipa: 'ˌmɛləˈtoʊnən' },
  { kind: 'ipa', term: 'ferrous sulfate', ipa: 'ˈfɛrəs ˈsʌlˌfeɪt' },
  { kind: 'ipa', term: 'ferrous',        ipa: 'ˈfɛrəs' },

  // ── Shorthand — alias substitution ──────────────────────────
  { kind: 'alias', term: 'PRN',     alias: 'as needed' },
  { kind: 'alias', term: 'O2 sat',  alias: 'oxygen sat' },
  { kind: 'alias', term: 'O2',      alias: 'oxygen' },
  { kind: 'alias', term: 'RR',      alias: 'respiratory rate' },
  { kind: 'alias', term: 'HR',      alias: 'heart rate' },
  { kind: 'alias', term: 'BP',      alias: 'blood pressure' },
  { kind: 'alias', term: 'BPM',     alias: 'beats per minute' },
  { kind: 'alias', term: 'DNR',     alias: 'D. N. R.' },
  { kind: 'alias', term: 'KanTime', alias: 'Kan Time' },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Precompile, longest term first to prevent sub-string matches winning.
const COMPILED = [...RULES]
  .sort((a, b) => b.term.length - a.term.length)
  .map((rule) => ({
    rule,
    pattern: new RegExp(
      `(?<![A-Za-z])${escapeRegex(rule.term)}(?![A-Za-z])`,
      'gi',
    ),
  }));

/**
 * Remove Markdown formatting characters before TTS. Without this, the engine
 * reads `**Albuterol**` as "asterisk asterisk Albuterol asterisk asterisk".
 *
 * Conservative by design: strips the common structural/emphasis markers the
 * agent emits, leaves ambiguous characters (single `*` inside a math
 * expression, standalone `_`) alone.
 *
 * MUST run before applyPronunciation() — otherwise the <phoneme> tags we
 * insert could be mistaken for stray markup.
 */
export function stripMarkdown(text: string): string {
  let out = text;

  // Fenced code blocks: ```lang\n…\n``` → content
  out = out.replace(/```[a-z0-9]*\n?([\s\S]*?)```/gi, '$1');

  // Inline code: `text` → text
  out = out.replace(/`([^`]+)`/g, '$1');

  // Images: ![alt](url) → alt
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Links: [text](url) → text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Bold: **text** and __text__ → text
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');

  // Italic: *text* / _text_, only when the markers tightly wrap the content
  // (avoids mangling things like "5 * 3 = 15" or snake_case identifiers).
  out = out.replace(
    /(?<=\s|^)\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?=[\s.,;:!?)]|$)/g,
    '$1',
  );
  out = out.replace(
    /(?<=\s|^)_([^\s_][^_\n]*?[^\s_]|[^\s_])_(?=[\s.,;:!?)]|$)/g,
    '$1',
  );

  // ATX headings at line start: `### Title` → `Title`
  out = out.replace(/^#{1,6}\s+/gm, '');

  // Blockquote markers at line start: `> quoted` → `quoted`
  out = out.replace(/^>\s+/gm, '');

  // Unordered list bullets at line start: `- item` / `* item` / `+ item`
  // Preserve leading indent so nested lists don't collapse.
  out = out.replace(/^(\s*)[-*+]\s+/gm, '$1');

  // Horizontal rules on their own line: `---`, `***`, `___`
  out = out.replace(/^\s*[-*_]{3,}\s*$/gm, '');

  // Stray leftover runs of emphasis marks (belt & suspenders).
  out = out.replace(/\*\*+/g, '');
  out = out.replace(/__+/g, '');

  // Tidy whitespace left behind by removed markup.
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.replace(/[ \t]+\n/g, '\n');

  return out.trim();
}

/** Models that render <phoneme> SSML tags. Others will speak them literally. */
const PHONEME_MODELS = new Set([
  'eleven_turbo_v2',
  'eleven_flash_v2',
  'eleven_english_v1',
]);

export function modelSupportsPhonemes(modelId: string): boolean {
  return PHONEME_MODELS.has(modelId);
}

/**
 * Rewrite the text so TTS says medical terms correctly.
 *
 * @param text     The agent's spoken text.
 * @param modelId  The ElevenLabs model that will synthesize it. Determines
 *                 whether we can use phoneme SSML or must fall back to the
 *                 raw term (alias rules always apply).
 */
export function applyPronunciation(text: string, modelId: string): string {
  const usePhonemes = modelSupportsPhonemes(modelId);
  let out = text;

  for (const { rule, pattern } of COMPILED) {
    if (rule.kind === 'ipa') {
      if (usePhonemes) {
        out = out.replace(
          pattern,
          (match) => `<phoneme alphabet="ipa" ph="${rule.ipa}">${match}</phoneme>`,
        );
      }
      // No-op on models that don't support phoneme tags — we leave the
      // original word intact rather than inserting gibberish the engine
      // would speak literally.
    } else {
      out = out.replace(pattern, rule.alias);
    }
  }

  return out;
}
