// Pure bookkeeping for which "source" (word bank vs. grid-typed) caused a
// word to be added to the fill engine's word index. Extracted from
// WFCWorker.worker.ts so it's unit-testable outside the comlink/worker
// environment.
//
// Invariant: a word placed in a grid slot must remain in the index for as
// long as it is still on the grid, even if it is also (or was previously)
// a bank word that gets removed from the bank. We track *why* each word is
// in the pool via a set of sources, and only allow splicing a word out of
// the index when (a) no source references it any more and (b) we actually
// inserted it ourselves (i.e. it isn't a base-dictionary word).

export type WordSource = 'bank' | 'grid';

export interface WordSourcePool {
  // Why each currently-tracked word was added.
  wordSources: Map<string, Set<WordSource>>;
  // Words we actually inserted into the index (not already base-dictionary
  // words). Only these may ever be spliced back out.
  insertedWords: Set<string>;
}

export function createWordSourcePool(): WordSourcePool {
  return { wordSources: new Map(), insertedWords: new Set() };
}

// Record that `words` were added because of `source`, and record which of
// them were actually inserted into the index (as opposed to already being
// base-dictionary words), per the `inserted` list returned by the index
// insert call.
export function recordAdd(
  pool: WordSourcePool,
  words: string[],
  source: WordSource,
  inserted: string[]
): void {
  for (const w of words) {
    let sources = pool.wordSources.get(w);
    if (!sources) {
      sources = new Set();
      pool.wordSources.set(w, sources);
    }
    sources.add(source);
  }
  for (const w of inserted) pool.insertedWords.add(w);
}

// Remove the 'bank' source from each word (called only on bank removal).
// Returns the words that should actually be spliced out of the index: those
// that now have no remaining sources AND that we ourselves inserted.
export function recordRemove(pool: WordSourcePool, words: string[]): string[] {
  const toSplice: string[] = [];
  for (const w of words) {
    const sources = pool.wordSources.get(w);
    if (sources) {
      sources.delete('bank');
      if (sources.size > 0) continue; // still referenced (e.g. by 'grid')
      pool.wordSources.delete(w);
    }
    if (pool.insertedWords.has(w)) {
      pool.insertedWords.delete(w);
      toSplice.push(w);
    }
  }
  return toSplice;
}

// Words that should be re-added after an index rebuild (resetIndex /
// setAlphabet): only bank-sourced words survive. Grid-only words are
// dropped entirely (their bookkeeping is deleted from the pool).
export function wordsToRetainOnRebuild(pool: WordSourcePool): string[] {
  const retained: string[] = [];
  for (const [word, sources] of Array.from(pool.wordSources.entries())) {
    if (sources.has('bank')) {
      retained.push(word);
    } else {
      pool.wordSources.delete(word);
    }
  }
  return retained;
}

// After re-adding `retained` words to a freshly rebuilt index, refresh
// `insertedWords` from the actual insert result.
export function refreshInsertedAfterRebuild(
  pool: WordSourcePool,
  inserted: string[]
): void {
  pool.insertedWords.clear();
  for (const w of inserted) pool.insertedWords.add(w);
}
