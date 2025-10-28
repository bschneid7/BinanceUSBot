import { Types } from 'mongoose';
import Deposit from '../models/Deposit';

/**
 * Deposit Service
 * Handles deposit/withdrawal tracking and calculations
 */
class DepositService {
  /**
   * Get net deposits (deposits - withdrawals) for a date range
   */
  async getNetDeposits(
    userId: Types.ObjectId,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    const query: any = { userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    
    const records = await Deposit.find(query);
    
    const deposits = records
      .filter(r => r.type === 'DEPOSIT')
      .reduce((sum, r) => sum + r.usdValue, 0);
    
    const withdrawals = records
      .filter(r => r.type === 'WITHDRAWAL')
      .reduce((sum, r) => sum + r.usdValue, 0);
    
    return deposits - withdrawals;
  }
  
  /**
   * Get total deposits (all time)
   */
  async getTotalDeposits(userId: Types.ObjectId): Promise<number> {
    const deposits = await Deposit.find({ userId, type: 'DEPOSIT' });
    return deposits.reduce((sum, d) => sum + d.usdValue, 0);
  }
  
  /**
   * Get total withdrawals (all time)
   */
  async getTotalWithdrawals(userId: Types.ObjectId): Promise<number> {
    const withdrawals = await Deposit.find({ userId, type: 'WITHDRAWAL' });
    return withdrawals.reduce((sum, w) => sum + w.usdValue, 0);
  }
  
  /**
   * Add a deposit record
   */
  async addDeposit(
    userId: Types.ObjectId,
    asset: string,
    amount: number,
    usdValue: number,
    date: Date,
    source: string = 'MANUAL',
    notes?: string
  ): Promise<void> {
    await Deposit.create({
      userId,
      type: 'DEPOSIT',
      asset,
      amount,
      usdValue,
      date,
      source,
      notes,
    });
    
    console.log(`[DepositService] Added deposit: ${amount} ${asset} ($${usdValue})`);
  }
  
  /**
   * Add a withdrawal record
   */
  async addWithdrawal(
    userId: Types.ObjectId,
    asset: string,
    amount: number,
    usdValue: number,
    date: Date,
    source: string = 'MANUAL',
    notes?: string
  ): Promise<void> {
    await Deposit.create({
      userId,
      type: 'WITHDRAWAL',
      asset,
      amount,
      usdValue,
      date,
      source,
      notes,
    });
    
    console.log(`[DepositService] Added withdrawal: ${amount} ${asset} ($${usdValue})`);
  }
  
  /**
   * Get all deposits/withdrawals for a user
   */
  async getAll(userId: Types.ObjectId): Promise<any[]> {
    return await Deposit.find({ userId }).sort({ date: 1 });
  }
}

export default new DepositService();

