import type { AIProvider } from './provider';
import type { EntryAnalysisResult, ProviderChatMessage } from '@/types';
import { stripMarkdown } from '../utils/text';

/**
 * A fully-local, dependency-free provider used until a real model is wired in.
 *
 * It is deliberately heuristic rather than "fake random": analysis uses small
 * sentiment/keyword lexicons and simple NER so the UI shows meaningful values,
 * and chat produces grounded answers from the retrieved diary context passed in
 * the system message. This lets every downstream feature (analysis UI, chat,
 * RAG, trends) be built and tested with no model, and be swapped for a real
 * provider without touching callers.
 */

const POSITIVE = ['happy', 'joy', 'glad', 'grateful', 'love', 'excited', 'great', 'good', 'wonderful', 'calm', 'peaceful', 'proud', 'relaxed', 'hopeful', 'content', 'fun', 'enjoyed', 'smile', 'delighted', 'accomplished'];
const NEGATIVE = ['sad', 'angry', 'anxious', 'worried', 'stress', 'stressed', 'tired', 'exhausted', 'upset', 'afraid', 'lonely', 'frustrated', 'annoyed', 'overwhelmed', 'depressed', 'fear', 'cried', 'hurt', 'bad', 'terrible'];
const HIGH_ENERGY = ['ran', 'run', 'running', 'gym', 'workout', 'walked', 'hiked', 'danced', 'played', 'busy', 'energetic', 'active', 'productive', 'travelled', 'traveled'];
const LOW_ENERGY = ['tired', 'exhausted', 'slept', 'rest', 'lazy', 'nap', 'drained', 'sick', 'bed'];
const STRESS_WORDS = ['deadline', 'stress', 'stressed', 'pressure', 'overwhelmed', 'anxious', 'worried', 'rush', 'conflict', 'argument', 'problem', 'exam', 'meeting'];

const TOPIC_LEXICON: Record<string, string[]> = {
  work: ['work', 'job', 'office', 'meeting', 'project', 'boss', 'deadline', 'client', 'colleague', 'career'],
  family: ['family', 'mom', 'mum', 'dad', 'mother', 'father', 'sister', 'brother', 'parents', 'son', 'daughter'],
  friends: ['friend', 'friends', 'party', 'hangout', 'dinner', 'drinks'],
  health: ['gym', 'workout', 'run', 'running', 'doctor', 'sick', 'sleep', 'diet', 'health', 'yoga'],
  travel: ['trip', 'travel', 'flight', 'hotel', 'vacation', 'holiday', 'beach', 'airport'],
  study: ['study', 'exam', 'class', 'course', 'university', 'homework', 'read', 'book'],
  food: ['food', 'cooked', 'cooking', 'restaurant', 'lunch', 'dinner', 'breakfast', 'coffee'],
  money: ['money', 'salary', 'bills', 'budget', 'rent', 'shopping', 'bought'],
  nature: ['walk', 'park', 'hike', 'mountain', 'sea', 'garden', 'forest', 'sunset'],
  creativity: ['photography', 'photo', 'music', 'paint', 'drawing', 'writing', 'guitar', 'piano'],
};

const ACTIVITY_VERBS = ['walking', 'running', 'cooking', 'reading', 'writing', 'painting', 'swimming', 'cycling', 'hiking', 'shopping', 'travelling', 'traveling', 'studying', 'working', 'gaming', 'dancing', 'singing', 'gardening'];

const STOPWORDS = new Set(['the', 'and', 'was', 'were', 'this', 'that', 'with', 'from', 'have', 'today', 'then', 'they', 'them', 'about', 'into', 'when', 'what', 'your', 'just', 'been', 'over', 'very', 'some', 'because', 'would', 'could', 'should', 'after', 'before', 'their', 'there', 'here', 'like', 'went', 'also', 'more', 'much', 'even', 'than', 'time', 'know', 'feel', 'felt', 'really', 'being', 'while', 'still', 'these', 'those']);

function tokenize(text: string): string[] {
  return stripMarkdown(text).toLowerCase().match(/[a-zà-ÿ']+/gi) ?? [];
}

function score(words: string[], lexicon: string[]): number {
  const set = new Set(lexicon);
  return words.filter((w) => set.has(w)).length;
}

/** Squash a raw count into [0,1] with diminishing returns. */
function normalize(count: number, scale = 3): number {
  return Math.min(1, count / scale);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Naive proper-noun extraction: capitalized words not at sentence start. */
function extractPeople(content: string): string[] {
  const text = stripMarkdown(content);
  const found = new Set<string>();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const commonCaps = new Set(['I', 'The', 'A', 'My', 'We', 'It', 'This', 'That', 'They', 'He', 'She', 'Today', 'Yesterday', 'Tomorrow', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
  for (const s of sentences) {
    const words = s.trim().split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (clean.length < 3) return;
      if (i === 0) return; // skip sentence-initial capitalization
      if (commonCaps.has(clean)) return;
      if (/^[A-ZÀ-Þ][a-zà-ÿ]+$/.test(clean)) found.add(clean);
    });
  }
  return [...found].slice(0, 8);
}

async function* singleChunk(text: string): AsyncIterable<string> {
  // Emit word-by-word so the UI's streaming path is exercised end to end.
  const parts = text.split(/(\s+)/);
  for (const p of parts) {
    yield p;
    await new Promise((r) => setTimeout(r, 8));
  }
}

export class MockAIProvider implements AIProvider {
  readonly id = 'mock';
  readonly label: string;
  readonly isLocal = true;
  private readonly statusDetail: string;

  constructor(
    label = 'Local heuristic (built-in)',
    statusDetail = 'Built-in local analysis · no data leaves this device',
  ) {
    this.label = label;
    this.statusDetail = statusDetail;
  }

  async analyzeEntry(content: string): Promise<EntryAnalysisResult> {
    const words = tokenize(content);
    const pos = score(words, POSITIVE);
    const neg = score(words, NEGATIVE);
    const stressCount = score(words, STRESS_WORDS);
    const highE = score(words, HIGH_ENERGY);
    const lowE = score(words, LOW_ENERGY);

    const mood = clamp01(0.5 + (pos - neg) * 0.12);
    const stress = clamp01(0.2 + normalize(stressCount + neg, 4) * 0.8);
    const energy = clamp01(0.5 + (highE - lowE) * 0.12);

    const topics: string[] = [];
    for (const [topic, lex] of Object.entries(TOPIC_LEXICON)) {
      if (score(words, lex) > 0) topics.push(topic);
    }

    const activities = ACTIVITY_VERBS.filter((a) => words.includes(a));

    const people = extractPeople(content);

    const summary = buildSummary(content);
    const important = neg + stressCount >= 4 || content.length > 1200;

    return {
      summary,
      mood: round2(mood),
      stress: round2(stress),
      energy: round2(energy),
      topics: topics.slice(0, 6),
      people,
      places: extractPlaces(words, content),
      activities: activities.slice(0, 6),
      important,
    };
  }

  async chat(messages: ProviderChatMessage[]): Promise<string> {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (isRefinement(last)) return acknowledgeRefinement();
    return answerFromContext(messages);
  }

  async summarizeConversation(messages: ProviderChatMessage[]): Promise<string> {
    // Heuristic: build a first-person entry from what the user actually said,
    // applying any refinement instructions ("change X to Y", "remove X",
    // "make it shorter") in order. A real provider rewrites into prose; the mock
    // stays faithful to the user's own words and edits.
    const userTurns = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim())
      .filter((t) => t.length > 0);

    let draft = '';
    for (const turn of userTurns) {
      if (isRefinement(turn)) {
        draft = applyRefinement(draft, turn);
      } else {
        const s = /[.!?]$/.test(turn) ? turn : `${turn}.`;
        draft = draft ? `${draft}\n\n${s}` : s;
      }
    }
    return draft.trim();
  }

  chatStream(messages: ProviderChatMessage[]): AsyncIterable<string> {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const text = isRefinement(last) ? acknowledgeRefinement() : answerFromContext(messages);
    return singleChunk(text);
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic bag-of-words hashed embedding so the vector-search plumbing
    // (Phase 4) can be exercised before a real embedding model exists.
    const dims = 64;
    const vec = new Array<number>(dims).fill(0);
    for (const w of tokenize(text)) {
      let h = 0;
      for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
      const idx = h % dims;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async status(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: this.statusDetail };
  }
}

// Small place lexicon; real NER comes with a real model later.
const KNOWN_PLACE_HINTS = ['salamanca', 'madrid', 'barcelona', 'london', 'paris', 'tokyo', 'japan', 'york', 'beach', 'park', 'office', 'home', 'gym', 'school', 'university', 'airport', 'mountains'];

function extractPlaces(words: string[], content: string): string[] {
  const set = new Set<string>();
  for (const w of words) {
    if (KNOWN_PLACE_HINTS.includes(w)) set.add(w[0]!.toUpperCase() + w.slice(1));
  }
  // "in/at/to <Capitalized>" pattern
  const m = stripMarkdown(content).matchAll(/\b(?:in|at|to|from)\s+([A-ZÀ-Þ][a-zà-ÿ]+)/g);
  for (const match of m) {
    const place = match[1];
    if (place && place.length > 2) set.add(place);
  }
  return [...set].slice(0, 6);
}

// --- Draft refinement (mock heuristics for "change X to Y" etc.) ------------
//
// This is a deliberately small, bilingual (EN/ES) heuristic. It CANNOT truly
// rewrite prose or understand arbitrary phrasing — that needs a real model
// (Settings › Local model). Its jobs are: (a) recognise an edit instruction so
// it is never appended to the entry as content, and (b) apply the common,
// unambiguous edits — shorten, change X→Y, remove X, add Y — in any accents.

/** Strip diacritics for language-tolerant matching (é→e, ñ→n, …). */
function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Imperative stems that mark a message as an edit instruction (EN + ES),
// tested against a de-accented, lower-cased copy of the message.
const REFINEMENT_START =
  /^\s*(?:change|replace|swap|instead of|remove|delete|take out|drop|make it|rewrite|reword|shorten|shorter|condense|expand|also (?:add|mention|include)|add that|include that|i\s*don'?t like|don'?t like|cambia|cambial|reemplaza|reemplazal|sustituye|sustituyel|pon |quita|quital|elimina|eliminal|borra|borral|saca|sacal|anade|anadel|agrega|agregal|incluye|incluyel|compacta|compactal|acorta|acortal|resume|resumel|resumir|reescrib|reformula|hazlo|haz que|mas corto|mas breve|mas largo|no me gusta)/i;

function isRefinement(text: string): boolean {
  return REFINEMENT_START.test(deaccent(text));
}

function acknowledgeRefinement(): string {
  const options = [
    "Done — I've updated the draft on the right.",
    "Got it, I've revised your entry. Take a look on the right.",
    'Updated. The draft on the right now reflects that.',
    "Sure — I've adjusted the entry accordingly.",
  ];
  return options[Math.floor(Math.random() * options.length)]!;
}

function clean(s: string): string {
  return s.trim().replace(/^["'“”‘’]|["'“”‘’.!,]+$/g, '').trim();
}

function tidy(draft: string): string {
  return draft
    .split('\n\n')
    .map((p) => p.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
    .trim();
}

/**
 * Apply a single refinement instruction to the current draft.
 * Matching is done on a de-accented copy of the instruction; the draft itself
 * is edited via accent-insensitive regexes so Spanish text is handled too.
 */
function applyRefinement(draft: string, instruction: string): string {
  const t = deaccent(instruction.trim());

  // "(I) don't like X, change it to Y"  |  "no me gusta X, cambialo por Y"
  let m =
    t.match(/don'?t like\s+(.+?)[,.\s]+(?:change (?:it )?to|make it|replace with|use|say)\s+(.+)/i) ??
    t.match(/no me gusta\s+(.+?)[,.\s]+(?:cambial\w*(?:\s+(?:por|a))?|reemplazal\w*(?:\s+(?:por|con))?|pon|usa)\s+(.+)/i);
  if (m) return tidy(smartReplace(draft, clean(m[1]!), clean(m[2]!)));

  // change/replace X to/with Y  |  cambia/reemplaza/sustituye X por/a/con Y
  m =
    t.match(/(?:change|replace|swap)\s+(.+?)\s+(?:to|with|for|into|by)\s+(.+)/i) ??
    t.match(/instead of\s+(.+?)[,]?\s+(?:say|write|use|put|make it)\s+(.+)/i) ??
    t.match(/(?:cambia|reemplaza|sustituye)\s+(.+?)\s+(?:por|a|con|en)\s+(.+)/i);
  if (m) return tidy(smartReplace(draft, clean(m[1]!), clean(m[2]!)));

  // shorter / condense  |  compactar / acortar / resumir / más corto
  if (
    /(?:shorter|condense|trim|too long|shorten|briefer|concise|compact\w*|acort\w*|resum\w*|mas corto|mas breve)/i.test(t)
  ) {
    return tidy(shorten(draft));
  }

  // remove X  |  quitar/eliminar/borrar X   (strip filler like "the part about")
  m = t.match(/(?:remove|delete|take out|drop|quita\w*|elimina\w*|borra\w*|saca\w*)\s+(.+)/i);
  if (m) {
    const target = clean(
      m[1]!
        .replace(/^(?:the\s+)?(?:part|bit|section|sentence|line|paragraph|mention|reference)\s+(?:about|of|to|on|regarding)\s+/i, '')
        .replace(/^(?:la\s+|el\s+)?(?:parte|frase|linea|seccion|mencion|oracion)\s+(?:de|del|sobre|acerca de|que)\s+/i, '')
        .replace(ARTICLE, '')
        .replace(ARTICLE_ES, ''),
    );
    return tidy(removePhrase(draft, target));
  }

  // add Y  |  añadir/agregar/incluir (que) Y
  m = t.match(
    /(?:also (?:add|mention|include)|add that|include that|expand(?: on)?|anad\w*|agrega\w*|inclu\w*)\s+(?:that\s+|que\s+)?(.+)/i,
  );
  if (m) {
    const extra = clean(m[1]!);
    const s = /[.!?]$/.test(extra) ? extra : `${extra}.`;
    return tidy(draft ? `${draft}\n\n${s}` : s);
  }

  // Recognised instruction we can't act on (e.g. "rewrite" / "reescríbelo"):
  // leave the draft unchanged rather than adding the instruction as content.
  return draft;
}

const ARTICLE = /^(?:the|a|an|my|our|your|his|her|their|some)\s+/i;
const ARTICLE_ES = /^(?:el|la|los|las|un|una|unos|unas|mi|mis|tu|tus|su|sus)\s+/i;
const PRONOUN = /^(?:it|this|that|these|those|them|they|lo|la|le|eso|esto|esa|ese)$/i;

const ACCENTS: Record<string, string> = {
  a: 'aáàäâã', e: 'eéèëê', i: 'iíìïî', o: 'oóòöôõ', u: 'uúùüû', n: 'nñ', c: 'cç',
};

/** Build a regex source that matches `find` regardless of accents/case. */
function accentInsensitive(find: string): string {
  return [...find]
    .map((ch) => {
      if (/[.*+?^${}()|[\]\\]/.test(ch)) return `\\${ch}`;
      const lc = ch.toLowerCase();
      if (ACCENTS[lc]) return `[${ACCENTS[lc]}${ACCENTS[lc].toUpperCase()}]`;
      return ch;
    })
    .join('');
}

function replaceAllInsensitive(haystack: string, find: string, replace: string): string {
  if (!find) return haystack;
  // Word boundaries so "it"/"la" never rewrite substrings inside other words.
  const re = new RegExp(`\\b${accentInsensitive(find)}\\b`, 'gi');
  return haystack.replace(re, replace);
}

/**
 * Replace X with Y, tolerating leading articles. If the exact phrase isn't in
 * the draft, fall back to the core noun (e.g. "the walk" -> "walk") so
 * "change the walk to a run" edits "a long walk" -> "a long run".
 */
function smartReplace(draft: string, find: string, replace: string): string {
  // A pronoun referent ("change it to…") can't be resolved heuristically.
  if (PRONOUN.test(find.trim())) return draft;
  const has = (s: string) => new RegExp(`\\b${accentInsensitive(s)}\\b`, 'i').test(draft);
  if (has(find)) return replaceAllInsensitive(draft, find, replace);
  const coreFind = find.replace(ARTICLE, '').replace(ARTICLE_ES, '').trim();
  const coreReplace = replace.replace(ARTICLE, '').replace(ARTICLE_ES, '').trim();
  if (coreFind && !PRONOUN.test(coreFind) && has(coreFind)) {
    return replaceAllInsensitive(draft, coreFind, coreReplace);
  }
  return draft;
}

/** Remove sentences containing the phrase; fall back to removing the substring. */
function removePhrase(draft: string, phrase: string): string {
  if (!phrase) return draft;
  const re = new RegExp(accentInsensitive(phrase), 'i');
  const paras = draft.split('\n\n').map((para) => {
    const sentences = para.split(/(?<=[.!?])\s+/).filter((s) => !re.test(s));
    return sentences.join(' ');
  });
  const result = paras.filter((p) => p.trim().length > 0).join('\n\n');
  return re.test(result)
    ? result.replace(new RegExp(accentInsensitive(phrase), 'gi'), '')
    : result;
}

/** Shorten a draft: keep the first sentence of each paragraph (or halve a single one). */
function shorten(draft: string): string {
  const paras = draft.split('\n\n').filter((p) => p.trim().length > 0);
  if (paras.length <= 1) {
    const sentences = (paras[0] ?? draft).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    return sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(' ');
  }
  return paras.map((p) => p.split(/(?<=[.!?])\s+/)[0] ?? p).join('\n\n');
}

function buildSummary(content: string): string {
  const text = stripMarkdown(content);
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 'Empty entry.';
  const first = sentences.slice(0, 2).join(' ');
  return first.length > 200 ? `${first.slice(0, 200).replace(/\s+\S*$/, '')}…` : first;
}

/**
 * Grounded heuristic answer. The chat service supplies retrieved diary context
 * in a system message (prefixed "DIARY CONTEXT"). We pull the sentences most
 * relevant to the user's question and stitch a careful, non-inventive reply.
 */
function answerFromContext(messages: ProviderChatMessage[]): string {
  const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const contextMsg = messages.find(
    (m) => m.role === 'system' && m.content.includes('DIARY CONTEXT'),
  );
  const context = contextMsg?.content ?? '';

  const contextBody = context.split('DIARY CONTEXT')[1] ?? '';
  const hasContext = contextBody.replace(/[-\s]/g, '').length > 0 && !/\(no relevant entries/i.test(context);

  if (!hasContext) {
    // No matching diary entries. This is also the reflective-journaling path:
    // respond as a supportive companion rather than a dead end.
    return (
      "I don't have diary entries about that yet — but I'm listening. Tell me more about " +
      'how it felt or what happened, and when you\'re ready, hit "Save as entry" and I\'ll ' +
      'turn our conversation into a diary entry for today.'
    );
  }

  const qTerms = new Set(
    tokenize(question).filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
  // Only real entry lines (they start with "- [date] ..."); ignore headers.
  const entryLines = contextBody
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, ''));

  if (entryLines.length === 0) {
    return "I couldn't find diary entries related to that. Try writing more, or rephrasing — I can only answer from what you've actually written.";
  }

  const scored = entryLines
    .map((line) => ({
      line,
      overlap: tokenize(line).filter((w) => qTerms.has(w)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap);

  const relevant = (scored.some((s) => s.overlap > 0)
    ? scored.filter((s) => s.overlap > 0)
    : scored
  )
    .slice(0, 4)
    .map((s) => s.line);

  const intro = "Based on your diary, here's what I found:";
  const body = relevant.map((l) => `- ${l}`).join('\n');
  const outro =
    '\n\nThis reflects only what you wrote — I haven\'t added anything that isn\'t in your entries.';
  return `${intro}\n\n${body}${outro}`;
}
