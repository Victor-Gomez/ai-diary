/** Rotating reflective writing prompts shown on the Today page. */
const PROMPTS = [
  'What was the best part of your day?',
  'What is something you are grateful for right now?',
  'What is on your mind that you haven’t said out loud?',
  'Who did you spend time with today, and how did it feel?',
  'What is one small thing you could do tomorrow for yourself?',
  'What challenged you today, and how did you respond?',
  'Describe a moment today you’d like to remember.',
  'What are you looking forward to?',
  'How is your energy today — and what affected it?',
  'What did you learn recently?',
];

/** Deterministic prompt-of-the-day so it is stable within a day. */
export function promptOfTheDay(date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return PROMPTS[dayOfYear % PROMPTS.length]!;
}
