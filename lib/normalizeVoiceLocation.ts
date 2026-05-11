/**
 * Normalizes voice transcripts for warehouse location codes.
 * Example: "0303 guion 02" → "0303-02"
 */
export function normalizeVoiceToLocation(transcript: string): string {
  let t = transcript.trim().toLowerCase();

  t = t.replace(/\b(guión|guion)\b/gi, '-');
  t = t.replace(/\braya\b/gi, '-');
  t = t.replace(/\s+/g, '');
  t = t.replace(/-+/g, '-');

  return t.toUpperCase();
}
