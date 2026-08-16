/** A single competing team on the scoreboard. */
export interface Team {
  id: string;
  name: string;
  score: number;
}

/**
 * A named person on the roster. Players are assigned to a team, or left in the
 * unassigned pool while the host sorts everyone out.
 */
export interface Player {
  id: string;
  name: string;
  teamId: string | null;
}

/** The complete, authoritative state of one scoreboard room. */
export interface RoomState {
  /** Human-friendly room code used in URLs, e.g. `quiz-night`. */
  code: string;
  title: string;
  subtitle: string;
  /**
   * When true the subtitle tracks the team count automatically. Editing the
   * subtitle by hand pins it and clears this flag.
   */
  subtitleAuto: boolean;
  teams: Team[];
  /** Everyone playing tonight, assigned or otherwise. */
  players: Player[];
  /** When true, cards are displayed highest-score-first instead of in entry order. */
  sortByScore: boolean;
  /** Monotonic revision, bumped on every mutation. Lets clients drop stale frames. */
  rev: number;
  updatedAt: number;
}

/** A team decorated with its computed standing and roster, ready to render. */
export interface RankedTeam extends Team {
  /** Competition rank: tied teams share a rank and the next rank is skipped. */
  rank: number;
  isLeader: boolean;
  members: Player[];
}

export interface RoomSummary {
  code: string;
  title: string;
  teamCount: number;
  updatedAt: number;
}

/** Everything a client needs after joining a room. */
export interface JoinResult {
  state: RoomState;
  /** True when this connection may mutate the board. */
  canControl: boolean;
  /** Whether an undo step is currently available. */
  canUndo: boolean;
  /**
   * Returned only when control was just granted by password, so the browser can
   * remember it and skip the prompt next time.
   */
  hostToken?: string;
  /** True when the server is password-protected, so the UI can offer to log in. */
  passwordRequired?: boolean;
}
