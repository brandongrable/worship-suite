/**
 * Per-user localStorage persistence for the Vocal Booth's view state.
 * Re-launching the app drops the user back where they left off (last
 * song, last screen) instead of always starting at Home.
 *
 * Keyed by Supabase user_id so multiple accounts on the same device
 * keep their own restore points. Tolerates malformed or missing data
 * by returning the home state.
 */

export type PersistedView =
  | 'home'
  | 'mixer'
  | 'mixer-song'
  | 'library'
  | 'song'
  | 'setlists'
  | 'setlist';

export type PersistedState = {
  view: PersistedView;
  selectedSongId: string | null;
  selectedSetlistId: string | null;
};

const VALID_VIEWS: ReadonlyArray<PersistedView> = [
  'home',
  'mixer',
  'mixer-song',
  'library',
  'song',
  'setlists',
  'setlist',
];

const DEFAULT_STATE: PersistedState = {
  view: 'home',
  selectedSongId: null,
  selectedSetlistId: null,
};

function storageKey(userId: string): string {
  return `vocal-booth:state:${userId}`;
}

export function loadPersistedState(userId: string): PersistedState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
    const obj = parsed as Record<string, unknown>;
    const view = VALID_VIEWS.includes(obj.view as PersistedView)
      ? (obj.view as PersistedView)
      : 'home';
    const selectedSongId =
      typeof obj.selectedSongId === 'string' ? obj.selectedSongId : null;
    const selectedSetlistId =
      typeof obj.selectedSetlistId === 'string' ? obj.selectedSetlistId : null;
    return { view, selectedSongId, selectedSetlistId };
  } catch {
    return DEFAULT_STATE;
  }
}

export function savePersistedState(userId: string, state: PersistedState): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Quota exceeded / private browsing — no recovery needed, the
    // user just won't get the restore-on-launch behavior.
  }
}

/**
 * Whether this user has dismissed the first-run welcome panel on
 * Home. Per-user keyed so a producer + choir member sharing the
 * same browser each see their own welcome once.
 */
const INTRO_KEY = (userId: string) => `vocal-booth:intro-seen:${userId}`;

export function hasSeenIntro(userId: string): boolean {
  try {
    return localStorage.getItem(INTRO_KEY(userId)) === '1';
  } catch {
    return true; // assume seen so we don't show twice
  }
}

export function markIntroSeen(userId: string): void {
  try {
    localStorage.setItem(INTRO_KEY(userId), '1');
  } catch {
    // No-op
  }
}
