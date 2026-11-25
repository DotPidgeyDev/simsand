import { CHRONICLE_PRESENTATION, chronicleTierAtLeast } from '@simsand/shared';
import type { ChronicleEntry } from '@simsand/shared';

// The newest feed-tier chronicle entries, held in memory for clients that
// connect later. The log in SQLite stays the durable record.
export class ChronicleFeed {
  private entries: ChronicleEntry[] = [];

  constructor(private readonly limit = 50) {}

  // Returns the entries that qualified for the feed.
  push(entries: readonly ChronicleEntry[]): ChronicleEntry[] {
    const accepted = entries.filter((entry) => chronicleTierAtLeast(entry.tier, CHRONICLE_PRESENTATION.feed));

    if (accepted.length === 0) return accepted;

    this.entries.push(...accepted);

    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }

    return accepted;
  }

  // Oldest first.
  recent(): ChronicleEntry[] {
    return [...this.entries];
  }
}
