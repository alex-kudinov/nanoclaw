/**
 * ai-tells — the standard anti-AI-ism check, made enforceable.
 *
 * One deterministic phrase/word blocklist shared by every client-facing output
 * path (today: the email send boundary, via email-content-guard). These are the
 * markers a trained reader treats as "a machine wrote this" — a single one
 * collapses the credibility of the whole message regardless of the surrounding
 * quality. The source of truth is groups/sales/VOICE-AND-TONE.md and the global
 * anti-AI-patterns note; this module is that curated list turned into code so it
 * fires whether or not the drafting agent obeyed its instructions.
 *
 * Doctrine (inherited from email-content-guard): zero-LLM, FALSE-POSITIVE-AVERSE.
 * Membership is limited to phrases and words that essentially never appear
 * legitimately in a Tandem client email. Words that VOICE-AND-TONE bans only
 * "as filler" and that carry a normal literal sense (leverage, navigate,
 * comprehensive, foster, resonate, facilitate, streamline, elevate, tailored …)
 * are DELIBERATELY EXCLUDED — a string scanner cannot judge intent, so blocking
 * them would generate noise. Extend the block list only with items that are
 * AI-tells in every context.
 */

export interface AiTell {
  re: RegExp;
  label: string;
}

// Multi-word phrases and constructions — unambiguous AI slop, ~zero false
// positives. Apostrophes are optional (') to tolerate curly-quote variants.
const PHRASE_TELLS: AiTell[] = [
  // Sycophantic openers
  {
    re: /\bthank(?:s)? (?:you )?for reaching out\b/i,
    label: 'thank you for reaching out',
  },
  { re: /\bthanks? for your interest\b/i, label: 'thanks for your interest' },
  { re: /\b(?:that'?s a |what a )?great question\b/i, label: 'great question' },
  {
    re: /\bi'?d be happy to (?:help|answer)\b/i,
    label: "i'd be happy to help",
  },
  { re: /\bhappy to (?:help|answer)\b/i, label: 'happy to help' },
  { re: /\bi understand your concern\b/i, label: 'i understand your concern' },
  { re: /\byou'?re absolutely right\b/i, label: "you're absolutely right" },
  // AI-sounding openers
  {
    re: /\bin today'?s fast[- ]?paced world\b/i,
    label: "in today's fast-paced world",
  },
  {
    re: /\bas we navigate these (?:challenging|difficult|uncertain) times\b/i,
    label: 'as we navigate these challenging times',
  },
  { re: /\bin (?:this|the) digital age\b/i, label: 'in the digital age' },
  {
    re: /\bin the ever[- ]?evolving world\b/i,
    label: 'in the ever-evolving world',
  },
  { re: /\bnow more than ever\b/i, label: 'now more than ever' },
  { re: /\bin the age of ai\b/i, label: 'in the age of AI' },
  // Importance-flagging filler
  {
    re: /\bit'?s important to (?:note|understand)\b/i,
    label: "it's important to note",
  },
  { re: /\bit'?s worth noting\b/i, label: "it's worth noting" },
  { re: /\bit goes without saying\b/i, label: 'it goes without saying' },
  { re: /\bneedless to say\b/i, label: 'needless to say' },
  { re: /\bone cannot overstate\b/i, label: 'one cannot overstate' },
  // Grandiose action phrases
  {
    re: /\bunlock (?:your )?(?:full )?potential\b/i,
    label: 'unlock your potential',
  },
  {
    re: /\belevate your (?:practice|coaching|game)\b/i,
    label: 'elevate your practice',
  },
  {
    re: /\bembark on (?:a|your|this) journey\b/i,
    label: 'embark on a journey',
  },
  {
    re: /\btransform your (?:approach|practice|coaching)\b/i,
    label: 'transform your approach',
  },
  { re: /\bharness the power\b/i, label: 'harness the power' },
  {
    re: /\btake (?:it|things|your \w+) to the next level\b/i,
    label: 'take it to the next level',
  },
  // Formulaic closings
  { re: /\bi hope this (?:helps|is helpful)\b/i, label: 'i hope this helps' },
  {
    re: /\bi hope you (?:find|found) (?:this|it) (?:valuable|helpful|useful)\b/i,
    label: 'i hope you found this valuable',
  },
  {
    re: /\bdon'?t hesitate to (?:contact|reach out|ask|get in touch)\b/i,
    label: "don't hesitate to contact us",
  },
  // Essayist / listicle tells
  { re: /\blet'?s (?:dive in|unpack)\b/i, label: "let's dive in / unpack" },
  {
    re: /\bin this (?:post|article|email|guide) we'?ll (?:explore|cover|dive)\b/i,
    label: "in this post we'll explore",
  },
  {
    re: /\bnobody(?:'s| is)? (?:really )?talking about\b/i,
    label: 'nobody is talking about',
  },
  {
    re: /\bthe thing nobody (?:wants to say|is saying|talks about)\b/i,
    label: 'the thing nobody wants to say',
  },
  { re: /\bspoiler alert\b/i, label: 'spoiler alert' },
  { re: /\bplot twist\b/i, label: 'plot twist' },
  { re: /\bgame[- ]?changers?\b/i, label: 'game-changer' },
  { re: /\bgame[- ]?changing\b/i, label: 'game-changing' },
  { re: /\bparadigm shift\b/i, label: 'paradigm shift' },
  { re: /\bcutting[- ]?edge\b/i, label: 'cutting-edge' },
  { re: /\bever[- ]?evolving\b/i, label: 'ever-evolving' },
  { re: /\bthought[- ]?provoking\b/i, label: 'thought-provoking' },
  { re: /\bthought leader(?:ship)?\b/i, label: 'thought leader' },
  { re: /\bcircle back\b/i, label: 'circle back' },
  { re: /\btake it offline\b/i, label: 'take it offline' },
  // "X isn't just Y, it's Z" filler construction
  {
    re: /\bisn'?t just\b[^.?!\n]{1,60}?\bit'?s\b/i,
    label: '"isn\'t just X, it\'s Y" construction',
  },
];

// Single words banned unconditionally by VOICE-AND-TONE (i.e. NOT the ones it
// only bans "as filler"). Matched on word boundaries. Kept to words with no
// common literal sense in a coaching email.
const WORD_TELLS = [
  'delve',
  'utilize',
  'bespoke',
  'captivating',
  'commendable',
  'daunting',
  'groundbreaking',
  'insightful',
  'intricate',
  'invaluable',
  'meticulous',
  'multifaceted',
  'noteworthy',
  'paramount',
  'pivotal',
  'remarkable',
  'revolutionary',
  'seamless',
  'transformative',
  'unparalleled',
  'unwavering',
  'vibrant',
  'amplify',
  'bolster',
  'spearhead',
  'supercharge',
  'unveil',
  'unveiled',
  'unveiling',
  'synergy',
];

const WORD_TELLS_RE = new RegExp(`\\b(${WORD_TELLS.join('|')})\\b`, 'gi');

/** Extra literal phrases to block, from EMAIL_AI_TELLS_EXTRA (comma-separated). */
function extraPhraseTells(): AiTell[] {
  return (process.env.EMAIL_AI_TELLS_EXTRA || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => ({
      re: new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
      label: p,
    }));
}

/**
 * Scan text for AI-tells. Returns a deduplicated list of matched labels
 * (empty when clean). Case-insensitive; runs the full phrase + word set.
 */
export function scanAiTells(text: string): string[] {
  const found = new Set<string>();
  // Fold curly quotes to straight so apostrophe patterns match either form.
  const hay = (text || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  for (const tell of [...PHRASE_TELLS, ...extraPhraseTells()]) {
    if (tell.re.test(hay)) found.add(tell.label);
  }
  for (const m of hay.matchAll(WORD_TELLS_RE)) {
    found.add(m[1].toLowerCase());
  }
  return [...found];
}
