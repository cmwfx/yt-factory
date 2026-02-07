/**
 * Fuzzy string matching utilities for aligning scene text with transcription.
 * Uses Levenshtein distance to calculate string similarity.
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the number of single-character edits needed to transform s1 into s2.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  // Initialize first column (deletions from s1)
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row (insertions to s2)
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix using dynamic programming
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Normalize text for comparison.
 * Removes punctuation, converts to lowercase, collapses whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();
}

/**
 * Calculate similarity percentage between two strings.
 * Returns 0-100 (100 = identical).
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const normalized1 = normalizeText(s1);
  const normalized2 = normalizeText(s2);

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  if (maxLength === 0) return 100;

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 100) / 100;
}

/**
 * Calculate word-level match percentage.
 * Compares individual words instead of full string to be more tolerant of word order.
 */
export function calculateWordMatchPercentage(
  sceneText: string,
  transcribedWords: string[]
): number {
  const sceneWords = normalizeText(sceneText).split(' ').filter(Boolean);
  const transcribedText = transcribedWords.join(' ');
  const transcribedNormalized = normalizeText(transcribedText);

  if (sceneWords.length === 0) return 0;

  // Count how many scene words appear in the transcribed text
  let matchedWords = 0;
  for (const sceneWord of sceneWords) {
    if (transcribedNormalized.includes(sceneWord)) {
      matchedWords++;
    }
  }

  const percentage = (matchedWords / sceneWords.length) * 100;
  return Math.round(percentage);
}

/**
 * Find the best word count for a scene by testing a range around the expected count.
 * Returns the word count that gives the best fuzzy match.
 */
export function findBestWordCount(
  sceneText: string,
  transcribedWords: string[],
  expectedCount: number,
  tolerance: number = 0.2
): { count: number; score: number; words: string[] } {
  const minWords = Math.floor(expectedCount * (1 - tolerance));
  const maxWords = Math.ceil(expectedCount * (1 + tolerance));

  let bestMatch = {
    count: Math.min(expectedCount, transcribedWords.length),
    score: 0,
    words: transcribedWords.slice(0, Math.min(expectedCount, transcribedWords.length)),
  };

  for (let n = minWords; n <= maxWords && n <= transcribedWords.length; n++) {
    const candidateWords = transcribedWords.slice(0, n);
    const score = calculateWordMatchPercentage(sceneText, candidateWords);

    if (score > bestMatch.score) {
      bestMatch = { count: n, score, words: candidateWords };
    }
  }

  return bestMatch;
}
