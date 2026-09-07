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
    if (isTranslationRequest(last)) return answerTranslation(messages, last);
    if (isRefinement(last)) return acknowledgeRefinement();
    return answerFromContext(messages);
  }

  async summarizeConversation(messages: ProviderChatMessage[], baseDraft?: string): Promise<string> {
    // Heuristic: build a first-person entry from what the user actually said,
    // applying any refinement instructions ("change X to Y", "remove X",
    // "make it shorter", "translate to Spanish") in order.
    let draft = baseDraft ?? '';

    if (!draft) {
      const sys = messages.find(
        (m) =>
          m.role === 'system' &&
          (m.content.includes('ORIGINAL ENTRY') ||
            m.content.includes('CURRENT FOCUSED ENTRY') ||
            m.content.includes('DIARY CONTEXT')),
      );
      if (sys) {
        const match = sys.content.match(/"""\n?([\s\S]*?)\n?"""/);
        if (match) draft = match[1]!.trim();
      }
    }

    const userTurns = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.trim())
      .filter((t) => t.length > 0);

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
    const text = isTranslationRequest(last)
      ? answerTranslation(messages, last)
      : isRefinement(last)
        ? acknowledgeRefinement()
        : answerFromContext(messages);
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
  /^\s*(?:(?:can|could)\s+you\s+(?:please\s+)?|please\s+|por\s+favor\s+)?(?:change|replace|swap|instead of|remove|delete|take out|drop|make it|rewrite|reword|shorten|shorter|condense|expand|also (?:add|mention|include)|add that|include that|i\s*don'?t like|don'?t like|translate|traduc\w*|traduccion|translation|cambia\w*|reemplaza\w*|sustituye\w*|pon |quita\w*|elimina\w*|borra\w*|saca\w*|anade\w*|agrega\w*|incluye\w*|compacta\w*|acorta\w*|resume\w*|resumir|reescrib\w*|reformula\w*|hazlo|haz que|mas corto|mas breve|mas largo|no me gusta)/i;

function isTranslationRequest(text: string): boolean {
  const de = deaccent(text).toLowerCase();
  return /\b(?:translate|traduc\w*|traduccion|translation)\b/i.test(de);
}

function isRefinement(text: string): boolean {
  const de = deaccent(text);
  return REFINEMENT_START.test(de) || isTranslationRequest(de);
}

function detectTargetLanguage(text: string): 'es' | 'en' | 'other' {
  const t = deaccent(text).toLowerCase();
  if (/spanish|espanol|castellano/i.test(t)) return 'es';
  if (/english|ingles/i.test(t)) return 'en';
  return 'es';
}

const EN_TO_ES_PHRASES: [RegExp, string][] = [
  [/\btoday was a really good day\b/gi, 'hoy fue un día realmente bueno'],
  [/\btoday was a really productive day\b/gi, 'hoy fue un día realmente productivo'],
  [/\btoday was a really tough day\b/gi, 'hoy fue un día realmente difícil'],
  [/\btoday was a good day\b/gi, 'hoy fue un buen día'],
  [/\btoday was a great day\b/gi, 'hoy fue un gran día'],
  [/\btoday was a tough day\b/gi, 'hoy fue un día difícil'],
  [/\btoday was a quiet day\b/gi, 'hoy fue un día tranquilo'],
  [/\btoday was a busy day\b/gi, 'hoy fue un día ajetreado'],
  [/\btoday was\b/gi, 'hoy fue'],
  [/\btoday i went to\b/gi, 'hoy fui a'],
  [/\btoday i felt\b/gi, 'hoy me sentí'],
  [/\btoday i\b/gi, 'hoy'],
  [/\byesterday was\b/gi, 'ayer fue'],
  [/\byesterday i went to\b/gi, 'ayer fui a'],
  [/\byesterday i\b/gi, 'ayer'],
  [/\bin the morning\b/gi, 'por la mañana'],
  [/\bin the afternoon\b/gi, 'por la tarde'],
  [/\bin the evening\b/gi, 'por la noche'],
  [/\bat night\b/gi, 'por la noche'],
  [/\bi went to\b/gi, 'fui a'],
  [/\bi went for a walk\b/gi, 'fui a dar un paseo'],
  [/\bi went for a run\b/gi, 'salí a correr'],
  [/\bi had a coffee\b/gi, 'tomé un café'],
  [/\bi had lunch\b/gi, 'almorcé'],
  [/\bi had dinner\b/gi, 'cené'],
  [/\bi had breakfast\b/gi, 'desayuné'],
  [/\bi felt like\b/gi, 'sentí como'],
  [/\bi felt\b/gi, 'me sentí'],
  [/\bi feel\b/gi, 'me siento'],
  [/\bi decided to\b/gi, 'decidí'],
  [/\bi spent time\b/gi, 'pasé tiempo'],
  [/\bi spent\b/gi, 'pasé'],
  [/\bi talked with\b/gi, 'hablé con'],
  [/\bi talked to\b/gi, 'hablé con'],
  [/\bi met with\b/gi, 'me reuní con'],
  [/\bi worked on\b/gi, 'trabajé en'],
  [/\bi stayed home\b/gi, 'me quedé en casa'],
  [/\bi stayed at home\b/gi, 'me quedé en casa'],
  [/\beverything went smoothly\b/gi, 'todo salió muy bien'],
  [/\bit was great\b/gi, 'fue genial'],
  [/\bit was wonderful\b/gi, 'fue maravilloso'],
  [/\bit was nice\b/gi, 'estuvo bien'],
  [/\blooking forward to\b/gi, 'con ganas de'],
  [/\bi hope tomorrow\b/gi, 'espero que mañana'],
];

const EN_TO_ES_WORDS: Record<string, string> = {
  coffee: 'café',
  work: 'trabajo',
  office: 'oficina',
  project: 'proyecto',
  meeting: 'reunión',
  deadline: 'fecha límite',
  boss: 'jefe',
  colleague: 'colega',
  colleagues: 'colegas',
  park: 'parque',
  walk: 'paseo',
  walking: 'caminando',
  gym: 'gimnasio',
  workout: 'entrenamiento',
  running: 'corriendo',
  run: 'carrera',
  home: 'casa',
  house: 'casa',
  friend: 'amigo',
  friends: 'amigos',
  family: 'familia',
  parents: 'padres',
  mom: 'mamá',
  dad: 'papá',
  sister: 'hermana',
  brother: 'hermano',
  lunch: 'almuerzo',
  dinner: 'cena',
  breakfast: 'desayuno',
  food: 'comida',
  book: 'libro',
  music: 'música',
  movie: 'película',
  trip: 'viaje',
  travel: 'viaje',
  vacation: 'vacaciones',
  beach: 'playa',
  happy: 'feliz',
  glad: 'contento',
  grateful: 'agradecido',
  calm: 'tranquilo',
  relaxed: 'relajado',
  peaceful: 'pacífico',
  excited: 'emocionado',
  tired: 'cansado',
  exhausted: 'agotado',
  stressed: 'estresado',
  anxious: 'ansioso',
  worried: 'preocupado',
  sad: 'triste',
  good: 'bueno',
  great: 'genial',
  bad: 'malo',
  really: 'realmente',
  very: 'muy',
  and: 'y',
  with: 'con',
  without: 'sin',
  because: 'porque',
  but: 'pero',
  also: 'también',
  then: 'entonces',
  now: 'ahora',
  today: 'hoy',
  yesterday: 'ayer',
  tomorrow: 'mañana',
  day: 'día',
  days: 'días',
  week: 'semana',
  night: 'noche',
  morning: 'mañana',
  afternoon: 'tarde',
};

const ES_TO_EN_PHRASES: [RegExp, string][] = [
  [/\bhoy fue un dia realmente bueno\b/gi, 'Today was a really good day'],
  [/\bhoy fue un buen dia\b/gi, 'Today was a good day'],
  [/\bhoy fue un gran dia\b/gi, 'Today was a great day'],
  [/\bhoy fue un dia dificil\b/gi, 'Today was a tough day'],
  [/\bhoy fue un dia tranquilo\b/gi, 'Today was a quiet day'],
  [/\bhoy fue\b/gi, 'Today was'],
  [/\bhoy fui a\b/gi, 'Today I went to'],
  [/\bhoy me senti\b/gi, 'Today I felt'],
  [/\bhoy\b/gi, 'Today'],
  [/\bayer fue\b/gi, 'Yesterday was'],
  [/\bayer fui a\b/gi, 'Yesterday I went to'],
  [/\bayer\b/gi, 'Yesterday'],
  [/\bpor la manana\b/gi, 'In the morning'],
  [/\bpor la tarde\b/gi, 'In the afternoon'],
  [/\bpor la noche\b/gi, 'In the evening'],
  [/\bfui a dar un paseo\b/gi, 'I went for a walk'],
  [/\bfui a\b/gi, 'I went to'],
  [/\btome un cafe\b/gi, 'I had a coffee'],
  [/\bme senti\b/gi, 'I felt'],
  [/\bme siento\b/gi, 'I feel'],
  [/\bdecidi\b/gi, 'I decided to'],
  [/\bpase tiempo\b/gi, 'I spent time'],
  [/\bhable con\b/gi, 'I talked with'],
  [/\bme reuni con\b/gi, 'I met with'],
  [/\btrabaje en\b/gi, 'I worked on'],
  [/\bme quede en casa\b/gi, 'I stayed home'],
  [/\btodo salio muy bien\b/gi, 'Everything went smoothly'],
  [/\bfue genial\b/gi, 'It was great'],
  [/\bfue maravilloso\b/gi, 'It was wonderful'],
];

const ES_TO_EN_WORDS: Record<string, string> = {
  cafe: 'coffee',
  trabajo: 'work',
  oficina: 'office',
  proyecto: 'project',
  reunion: 'meeting',
  parque: 'park',
  paseo: 'walk',
  gimnasio: 'gym',
  casa: 'home',
  amigo: 'friend',
  amigos: 'friends',
  familia: 'family',
  almuerzo: 'lunch',
  cena: 'dinner',
  desayuno: 'breakfast',
  comida: 'food',
  libro: 'book',
  musica: 'music',
  pelicula: 'movie',
  viaje: 'trip',
  vacaciones: 'vacation',
  playa: 'beach',
  feliz: 'happy',
  contento: 'glad',
  tranquilo: 'calm',
  relajado: 'relaxed',
  cansado: 'tired',
  agotado: 'exhausted',
  estresado: 'stressed',
  triste: 'sad',
  bueno: 'good',
  genial: 'great',
  malo: 'bad',
  realmente: 'really',
  muy: 'very',
  y: 'and',
  con: 'with',
  sin: 'without',
  porque: 'because',
  pero: 'but',
  tambien: 'also',
  entonces: 'then',
  ahora: 'now',
  hoy: 'today',
  ayer: 'yesterday',
  manana: 'tomorrow',
  dia: 'day',
  dias: 'days',
  semana: 'week',
  noche: 'night',
  tarde: 'afternoon',
};

function mockTranslate(text: string, targetLang: string): string {
  if (!text.trim()) return text;
  if (targetLang === 'en') {
    let result = text;
    for (const [pattern, replacement] of ES_TO_EN_PHRASES) {
      result = result.replace(pattern, replacement);
    }
    const words = result.split(/(\b[A-Za-zÀ-ÿ]+\b)/g);
    result = words
      .map((w) => {
        const cleanW = deaccent(w.toLowerCase());
        const mapped = ES_TO_EN_WORDS[cleanW];
        if (mapped) {
          if (w[0] === w[0]?.toUpperCase()) {
            return mapped[0]?.toUpperCase() + mapped.slice(1);
          }
          return mapped;
        }
        return w;
      })
      .join('');
    return result.replace(/(?:^|[.!?]\s+)[a-z]/g, (match) => match.toUpperCase());
  }

  let result = text;
  for (const [pattern, replacement] of EN_TO_ES_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  const words = result.split(/(\b[A-Za-zÀ-ÿ']+\b)/g);
  result = words
    .map((w) => {
      const cleanW = w.toLowerCase().replace(/'s$/, '');
      const mapped = EN_TO_ES_WORDS[cleanW];
      if (mapped) {
        if (w[0] === w[0]?.toUpperCase()) {
          return mapped[0]?.toUpperCase() + mapped.slice(1);
        }
        return mapped;
      }
      return w;
    })
    .join('');
  return result.replace(/(?:^|[.!?]\s+)[a-z]/g, (match) => match.toUpperCase());
}

function answerTranslation(messages: ProviderChatMessage[], instruction: string): string {
  let entryText = '';
  const sys = messages.find(
    (m) =>
      m.role === 'system' &&
      (m.content.includes('CURRENT FOCUSED ENTRY') ||
        m.content.includes('ORIGINAL ENTRY') ||
        m.content.includes('DIARY CONTEXT')),
  );
  if (sys) {
    const match = sys.content.match(/"""\n?([\s\S]*?)\n?"""/);
    if (match) {
      entryText = match[1]!.trim();
    } else {
      const parts = sys.content.split(/(?:--- Entry from |- \[)/);
      if (parts.length > 1) {
        const first = parts[1]!.split(/LONG-TERM MEMORIES/)[0] ?? parts[1]!;
        const lines = first.split('\n');
        lines.shift();
        entryText = lines.join('\n').trim();
      }
    }
  }

  const targetLang = detectTargetLanguage(instruction);
  const langName = targetLang === 'es' ? 'Spanish' : targetLang === 'en' ? 'English' : 'your requested language';

  if (!entryText) {
    return `I couldn't find the entry to translate. Please make sure the entry is opened or shared.`;
  }

  const translated = mockTranslate(entryText, targetLang);
  return `Here is the translation of your entry into ${langName}:\n\n${translated}\n\nI've also updated the draft on the right so you can review and click **Update** to save it.`;
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
  // Collapse only runs of spaces/tabs — never newlines — so Markdown structure
  // (lists, headings, line breaks) survives refinement operations.
  return draft
    .split('\n\n')
    .map((p) =>
      p
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([.,!?])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .trim(),
    )
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

  if (isTranslationRequest(instruction)) {
    const targetLang = detectTargetLanguage(instruction);
    return tidy(mockTranslate(draft, targetLang));
  }

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

  // Check if there is a focused entry
  const focusedMatch = context.match(/CURRENT FOCUSED ENTRY \([^)]*dated ([^)]+)\):\n"""\n([\s\S]*?)\n"""/);
  const focusedEntry = focusedMatch ? { date: focusedMatch[1]!.trim(), content: focusedMatch[2]!.trim() } : null;

  const contextBody = context.split('DIARY CONTEXT')[1] ?? '';
  const hasContext = (Boolean(focusedEntry) || contextBody.replace(/[-\s]/g, '').length > 0) && !/\(no relevant entries/i.test(context);

  if (!hasContext) {
    // No matching diary entries. This is also the reflective-journaling path:
    // respond as a supportive companion rather than a dead end.
    return (
      "I don't have diary entries about that yet — but I'm listening. Tell me more about " +
      'how it felt or what happened, and when you\'re ready, hit "Save as entry" and I\'ll ' +
      'turn our conversation into a diary entry for today.'
    );
  }

  // If there's a focused entry, check if the user is asking about it
  if (focusedEntry) {
    const deQ = deaccent(question).toLowerCase();
    const isAboutEntry =
      /(?:what|tell|about|summary|summarize|explain|did i|happened|entry|write|read|content|all|whole|full|que|de que|cuenta|entrada)/i.test(deQ) ||
      tokenize(question).length <= 4;

    if (isAboutEntry) {
      return (
        `In your entry from **${focusedEntry.date}**, you wrote:\n\n` +
        `> ${focusedEntry.content.replace(/\n+/g, '\n> ')}\n\n` +
        `What would you like to explore or adjust about this entry?`
      );
    }
  }

  // Parse multi-line entry blocks from context
  const entryBlocks: { date: string; content: string }[] = [];
  if (focusedEntry) {
    entryBlocks.push(focusedEntry);
  }

  const parts = contextBody.split(/(?:--- Entry from |- \[)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.startsWith('relevant entries') || trimmed.startsWith('LONG-TERM MEMORIES')) continue;
    const endHeader = trimmed.indexOf('---');
    const endBracket = trimmed.indexOf(']');
    let date = '';
    let content = '';
    if (endHeader !== -1 && (endBracket === -1 || endHeader < endBracket)) {
      date = trimmed.slice(0, endHeader).trim();
      content = trimmed.slice(endHeader + 3).trim();
    } else if (endBracket !== -1) {
      date = trimmed.slice(0, endBracket).trim();
      content = trimmed.slice(endBracket + 1).trim();
    } else {
      content = trimmed;
    }
    content = content.split('LONG-TERM MEMORIES')[0]?.trim() ?? content;
    if (content && !entryBlocks.some((b) => b.content === content)) {
      entryBlocks.push({ date, content });
    }
  }

  if (entryBlocks.length === 0) {
    return "I couldn't find diary entries related to that. Try writing more, or rephrasing — I can only answer from what you've actually written.";
  }

  const qTerms = new Set(
    tokenize(question).filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );

  const scored = entryBlocks
    .map((b) => ({
      date: b.date,
      content: b.content,
      overlap: tokenize(b.content).filter((w) => qTerms.has(w)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap);

  const relevant = (scored.some((s) => s.overlap > 0) ? scored.filter((s) => s.overlap > 0) : scored).slice(0, 3);

  const intro = "Based on your diary, here's what I found:";
  const body = relevant
    .map((r) => `- **[${r.date}]**: ${r.content.length > 300 ? `${r.content.slice(0, 300)}…` : r.content}`)
    .join('\n\n');
  const outro =
    '\n\nThis reflects only what you wrote — I haven\'t added anything that isn\'t in your entries.';
  return `${intro}\n\n${body}${outro}`;
}
