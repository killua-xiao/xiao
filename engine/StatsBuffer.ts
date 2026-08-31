import { Dispatch, SetStateAction } from 'react';
import { GameState } from '../types';
import { PendingStats } from './types';

export class StatsBuffer {
  private pending: PendingStats = { score: 0, coins: 0 };

  queue(delta: { score?: number; coins?: number }): void {
    if (delta.score) this.pending.score += delta.score;
    if (delta.coins) this.pending.coins += delta.coins;
  }

  hasPending(): boolean {
    return this.pending.score !== 0 || this.pending.coins !== 0;
  }

  flush(setGameState: Dispatch<SetStateAction<GameState>>): void {
    if (!this.hasPending()) return;
    const pending = this.pending;
    setGameState(prev => ({
      ...prev,
      score: prev.score + pending.score,
      coinsCollected: prev.coinsCollected + pending.coins,
    }));
    this.pending = { score: 0, coins: 0 };
  }

  reset(): void {
    this.pending = { score: 0, coins: 0 };
  }
}
