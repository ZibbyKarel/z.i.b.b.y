/**
 * Staffing-driven capacity (docs/plans/zibbycorp/staffing-driven-capacity.md, decision 5):
 * the one ordering every lease and fuse slot is granted in —
 *   1. progress (furthest stage reached / phase count) — finish work before starting new work;
 *   2. task priority — no task carries a priority yet, so this tier is a no-op today;
 *   3. round-robin across projects — the project granted least recently goes first
 *      (replaces the old per-project `maxConcurrent` as the fairness mechanism);
 *   4. FIFO.
 */
export interface GrantRank {
  /** 0..1 — furthest stage ever reached / number of phases. Absent = 0 (a fresh task). */
  progress?: number;
  /** The engagement the work belongs to; absent = the shared "unattributed" bucket. */
  projectId?: string;
}

interface Entry<T> {
  rank: GrantRank;
  seq: number;
  item: T;
}

export class GrantQueue<T> {
  private seq = 0;
  private grants = 0;
  private readonly entries: Entry<T>[] = [];
  /** projectId ("" = unattributed) -> the grant counter value of its last grant. */
  private readonly lastGrant = new Map<string, number>();

  get size(): number {
    return this.entries.length;
  }

  enqueue(rank: GrantRank, item: T): void {
    this.entries.push({ rank, seq: this.seq++, item });
  }

  shift(): T | undefined {
    if (this.entries.length === 0) return undefined;
    let best = 0;
    for (let i = 1; i < this.entries.length; i++) {
      if (this.before(this.entries[i]!, this.entries[best]!)) best = i;
    }
    const [winner] = this.entries.splice(best, 1);
    this.noteGrant(winner!.rank.projectId);
    return winner!.item;
  }

  noteGrant(projectId?: string): void {
    this.lastGrant.set(projectId ?? "", ++this.grants);
  }

  private before(a: Entry<T>, b: Entry<T>): boolean {
    const pa = a.rank.progress ?? 0;
    const pb = b.rank.progress ?? 0;
    if (pa !== pb) return pa > pb;
    const ga = this.lastGrant.get(a.rank.projectId ?? "") ?? 0;
    const gb = this.lastGrant.get(b.rank.projectId ?? "") ?? 0;
    if (ga !== gb) return ga < gb;
    return a.seq < b.seq;
  }
}
