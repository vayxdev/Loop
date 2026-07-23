export interface RollingContextData {
  recentTargets: string[];
  maxRecentKeep: number;
}

export class RollingContext {
  recentTargets: string[];
  maxRecentKeep: number;

  constructor(maxRecentKeep = 40) {
    this.recentTargets = [];
    this.maxRecentKeep = maxRecentKeep;
  }

  render(nRecent: number): string {
    const tail = nRecent > 0 ? this.recentTargets.slice(-nRecent) : [];
    return tail.join('\n');
  }

  addTargets(targets: string[]): void {
    this.recentTargets.push(...targets.filter((t) => t && t.trim()));
    if (this.recentTargets.length > this.maxRecentKeep) {
      this.recentTargets = this.recentTargets.slice(-this.maxRecentKeep);
    }
  }

  toDict(): RollingContextData {
    return {
      recentTargets: this.recentTargets,
      maxRecentKeep: this.maxRecentKeep,
    };
  }

  static fromDict(d: RollingContextData, minKeep = 0): RollingContext {
    const max = Math.max(d.maxRecentKeep || 40, minKeep);
    const ctx = new RollingContext(max);
    ctx.recentTargets = (d.recentTargets || []).slice(-max);
    return ctx;
  }
}
