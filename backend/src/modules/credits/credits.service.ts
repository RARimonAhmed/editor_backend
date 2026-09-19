import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client.js';
import { InsufficientCreditsError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  referenceId?: string;
  createdAt: string;
}

// In-memory credit store for mock / standalone dev
const mockCreditBalances = new Map<string, number>();
const mockCreditLedger: CreditTransaction[] = [];

export class CreditsService {
  async getBalance(userId: string): Promise<number> {
    const memBalance = mockCreditBalances.get(userId);
    if (memBalance !== undefined) return memBalance;

    try {
      if (await db.isHealthy()) {
        const res = await db.query<{ balance: number }>(
          'SELECT balance FROM credit_wallets WHERE user_id = $1 LIMIT 1;',
          [userId]
        );
        if (res.rows.length > 0) {
          return res.rows[0].balance;
        }
      }
    } catch {
      // fallback
    }

    // Default starting credits for new users
    mockCreditBalances.set(userId, 100);
    return 100;
  }

  async deductCredits(userId: string, amount: number, reason: string, referenceId?: string): Promise<number> {
    const current = await this.getBalance(userId);
    if (current < amount) {
      throw new InsufficientCreditsError(
        `Insufficient credit balance: Required ${amount} credits, but current balance is only ${current} credits`
      );
    }

    const newBalance = current - amount;
    mockCreditBalances.set(userId, newBalance);

    const tx: CreditTransaction = {
      id: uuidv4(),
      userId,
      amount: -amount,
      type: 'ai_usage',
      description: reason,
      referenceId,
      createdAt: new Date().toISOString(),
    };
    mockCreditLedger.unshift(tx);

    try {
      if (await db.isHealthy()) {
        await db.query(
          'UPDATE credit_wallets SET balance = balance - $1, lifetime_used = lifetime_used + $1 WHERE user_id = $2;',
          [amount, userId]
        );
        await db.query(
          'INSERT INTO credit_transactions (user_id, amount, type, description, reference_id) VALUES ($1, $2, $3, $4, $5);',
          [userId, -amount, 'ai_usage', reason, referenceId || null]
        );
      }
    } catch {
      // fallback
    }

    logger.info({ userId, amount, newBalance, reason }, 'Credits deducted');
    return newBalance;
  }

  async grantCredits(userId: string, amount: number, type: string, description: string): Promise<number> {
    const current = await this.getBalance(userId);
    const newBalance = current + amount;
    mockCreditBalances.set(userId, newBalance);

    const tx: CreditTransaction = {
      id: uuidv4(),
      userId,
      amount,
      type,
      description,
      createdAt: new Date().toISOString(),
    };
    mockCreditLedger.unshift(tx);

    try {
      if (await db.isHealthy()) {
        await db.query('UPDATE credit_wallets SET balance = balance + $1 WHERE user_id = $2;', [amount, userId]);
      }
    } catch {
      // fallback
    }

    return newBalance;
  }

  async getHistory(userId: string): Promise<CreditTransaction[]> {
    const userLedger = mockCreditLedger.filter((t) => t.userId === userId);
    return userLedger;
  }
}

export const creditsService = new CreditsService();
