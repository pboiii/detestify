export interface EventStore {
  claim(id: string): Promise<boolean>;
  release(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
}

export class MemoryEventStore implements EventStore {
  private readonly claimed = new Set<string>();
  private readonly processed = new Set<string>();

  async claim(id: string): Promise<boolean> {
    if (this.claimed.has(id) || this.processed.has(id)) return false;
    this.claimed.add(id);
    return true;
  }

  async release(id: string): Promise<void> {
    this.claimed.delete(id);
  }

  async markProcessed(id: string): Promise<void> {
    this.claimed.delete(id);
    this.processed.add(id);
  }

  isClaimed(id: string): boolean {
    return this.claimed.has(id);
  }
}
