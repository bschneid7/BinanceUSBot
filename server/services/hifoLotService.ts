import { Types } from 'mongoose';
import Lot from '../models/Lot';
import SaleLine from '../models/SaleLine';
import Order from '../models/Order';

/**
 * HIFO Lot Service
 * Implements Highest-In-First-Out lot selection for tax optimization
 */

export interface LotSelection {
  lotId: Types.ObjectId;
  quantity: number;
  costBasis: number;
  acquiredDate: Date;
}

export interface HIFOResult {
  selections: LotSelection[];
  totalCostBasis: number;
  totalQuantity: number;
  saleLines: Array<{
    lotId: Types.ObjectId;
    quantitySold: number;
    costBasis: number;
    proceeds: number;
    gainLoss: number;
    acquiredDate: Date;
    soldDate: Date;
    holdingPeriod: 'SHORT' | 'LONG';
  }>;
}

export class HIFOLotService {
  /**
   * Select lots using HIFO (Highest-In-First-Out) method
   * This minimizes short-term capital gains by selling highest cost basis lots first
   */
  async selectLots(
    userId: Types.ObjectId,
    symbol: string,
    quantityToSell: number
  ): Promise<HIFOResult> {
    try {
      console.log(`[HIFO] Selecting lots for ${symbol} - Quantity: ${quantityToSell}`);

      // Get all available lots for this symbol, sorted by cost basis (highest first)
      const availableLots = await Lot.find({
        userId,
        symbol,
        status: { $in: ['OPEN', 'PARTIALLY_SOLD'] },
        remainingQuantity: { $gt: 0 },
      }).sort({ costPerUnit: -1, acquiredDate: 1 }); // HIFO: highest cost first, then FIFO for ties

      if (availableLots.length === 0) {
        throw new Error(`No available lots found for ${symbol}`);
      }

      console.log(`[HIFO] Found ${availableLots.length} available lots`);

      const selections: LotSelection[] = [];
      let remainingQuantity = quantityToSell;
      let totalCostBasis = 0;

      // Select lots until we have enough quantity
      for (const lot of availableLots) {
        if (remainingQuantity <= 0) break;

        const quantityFromThisLot = Math.min(lot.remainingQuantity, remainingQuantity);
        const costBasisFromThisLot = quantityFromThisLot * lot.costPerUnit;

        selections.push({
          lotId: lot._id,
          quantity: quantityFromThisLot,
          costBasis: costBasisFromThisLot,
          acquiredDate: lot.acquiredDate,
        });

        totalCostBasis += costBasisFromThisLot;
        remainingQuantity -= quantityFromThisLot;

        console.log(`[HIFO] Selected ${quantityFromThisLot} from lot ${lot.lotId} @ $${lot.costPerUnit.toFixed(2)} (acquired ${lot.acquiredDate.toISOString().split('T')[0]})`);
      }

      if (remainingQuantity > 0) {
        throw new Error(`Insufficient lots: need ${quantityToSell}, have ${quantityToSell - remainingQuantity}`);
      }

      console.log(`[HIFO] Total cost basis: $${totalCostBasis.toFixed(2)} for ${quantityToSell} units`);

      return {
        selections,
        totalCostBasis,
        totalQuantity: quantityToSell,
        saleLines: [], // Will be populated when recording the sale
      };
    } catch (error) {
      console.error('[HIFO] Error selecting lots:', error);
      throw error;
    }
  }

  /**
   * Record a sale and create sale lines for tax reporting
   */
  async recordSale(
    userId: Types.ObjectId,
    saleOrderId: Types.ObjectId,
    symbol: string,
    quantitySold: number,
    salePrice: number,
    soldDate: Date
  ): Promise<HIFOResult> {
    try {
      console.log(`[HIFO] Recording sale: ${symbol} - Qty: ${quantitySold} @ $${salePrice}`);

      // Select lots using HIFO
      const hifoResult = await this.selectLots(userId, symbol, quantitySold);

      const saleLines: HIFOResult['saleLines'] = [];

      // Create sale lines and update lot quantities
      for (const selection of hifoResult.selections) {
        const lot = await Lot.findById(selection.lotId);
        if (!lot) {
          throw new Error(`Lot ${selection.lotId} not found`);
        }

        // Calculate proceeds and gain/loss for this portion
        const proceeds = selection.quantity * salePrice;
        const gainLoss = proceeds - selection.costBasis;

        // Determine holding period (SHORT if <1 year, LONG if >=1 year)
        const holdingDays = Math.floor((soldDate.getTime() - lot.acquiredDate.getTime()) / (1000 * 60 * 60 * 24));
        const holdingPeriod = holdingDays >= 365 ? 'LONG' : 'SHORT';

        // Create sale line
        const saleLine = await SaleLine.create({
          userId,
          saleOrderId,
          lotId: lot._id,
          symbol,
          quantitySold: selection.quantity,
          costBasis: selection.costBasis,
          proceeds,
          gainLoss,
          acquiredDate: lot.acquiredDate,
          soldDate,
          holdingPeriod,
          evidence: {
            note: `HIFO sale: ${selection.quantity} @ $${salePrice.toFixed(2)}`,
          },
        });

        saleLines.push({
          lotId: lot._id,
          quantitySold: selection.quantity,
          costBasis: selection.costBasis,
          proceeds,
          gainLoss,
          acquiredDate: lot.acquiredDate,
          soldDate,
          holdingPeriod,
        });

        // Update lot remaining quantity and status
        lot.remainingQuantity -= selection.quantity;
        if (lot.remainingQuantity <= 0) {
          lot.status = 'FULLY_SOLD';
        } else {
          lot.status = 'PARTIALLY_SOLD';
        }
        await lot.save();

        console.log(`[HIFO] Sale line created: ${selection.quantity} units, gain/loss: $${gainLoss.toFixed(2)} (${holdingPeriod})`);
      }

      return {
        ...hifoResult,
        saleLines,
      };
    } catch (error) {
      console.error('[HIFO] Error recording sale:', error);
      throw error;
    }
  }

  /**
   * Create a lot from a BUY order
   */
  async createLot(
    userId: Types.ObjectId,
    orderId: Types.ObjectId,
    symbol: string,
    quantity: number,
    costPerUnit: number,
    fees: number,
    acquiredDate: Date
  ): Promise<void> {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Allocate fees proportionally to cost basis
      const totalCostBasis = (quantity * costPerUnit) + fees;
      const costPerUnitWithFees = totalCostBasis / quantity;

      const lotId = `${symbol}-${acquiredDate.getTime()}-${orderId.toString().slice(-6)}`;

      const lot = await Lot.create({
        userId,
        lotId,
        symbol,
        acquiredDate,
        quantity,
        costPerUnit: costPerUnitWithFees,
        totalCostBasis,
        feesAllocated: fees,
        remainingQuantity: quantity,
        status: 'OPEN',
        evidence: {
          orderId,
          exchangeOrderId: order.exchangeOrderId,
          note: `Buy order: ${quantity} @ $${costPerUnit.toFixed(2)} + $${fees.toFixed(2)} fees`,
        },
      });

      console.log(`[HIFO] Created lot ${lotId}: ${quantity} @ $${costPerUnitWithFees.toFixed(2)} (including fees)`);
    } catch (error) {
      console.error('[HIFO] Error creating lot:', error);
      throw error;
    }
  }

  /**
   * Export Form 8949 CSV for tax filing
   */
  async export8949CSV(
    userId: Types.ObjectId,
    taxYear: number
  ): Promise<string> {
    try {
      const startDate = new Date(taxYear, 0, 1);
      const endDate = new Date(taxYear, 11, 31, 23, 59, 59);

      const saleLines = await SaleLine.find({
        userId,
        soldDate: { $gte: startDate, $lte: endDate },
      }).sort({ soldDate: 1 });

      console.log(`[HIFO] Exporting Form 8949 for ${taxYear}: ${saleLines.length} sale lines`);

      // CSV header (IRS Form 8949 format)
      let csv = 'Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss,Holding Period\n';

      for (const line of saleLines) {
        const description = `${line.quantitySold} ${line.symbol}`;
        const dateAcquired = line.acquiredDate.toISOString().split('T')[0];
        const dateSold = line.soldDate.toISOString().split('T')[0];
        const proceeds = line.proceeds.toFixed(2);
        const costBasis = line.costBasis.toFixed(2);
        const gainLoss = line.gainLoss.toFixed(2);
        const holdingPeriod = line.holdingPeriod;

        csv += `"${description}",${dateAcquired},${dateSold},${proceeds},${costBasis},${gainLoss},${holdingPeriod}\n`;
      }

      return csv;
    } catch (error) {
      console.error('[HIFO] Error exporting Form 8949:', error);
      throw error;
    }
  }

  /**
   * Get lot summary for a user
   */
  async getLotSummary(userId: Types.ObjectId): Promise<{
    totalLots: number;
    openLots: number;
    totalCostBasis: number;
    bySymbol: Record<string, { quantity: number; costBasis: number }>;
  }> {
    try {
      const lots = await Lot.find({
        userId,
        status: { $in: ['OPEN', 'PARTIALLY_SOLD'] },
        remainingQuantity: { $gt: 0 },
      });

      const bySymbol: Record<string, { quantity: number; costBasis: number }> = {};
      let totalCostBasis = 0;

      for (const lot of lots) {
        if (!bySymbol[lot.symbol]) {
          bySymbol[lot.symbol] = { quantity: 0, costBasis: 0 };
        }
        bySymbol[lot.symbol].quantity += lot.remainingQuantity;
        bySymbol[lot.symbol].costBasis += lot.remainingQuantity * lot.costPerUnit;
        totalCostBasis += lot.remainingQuantity * lot.costPerUnit;
      }

      return {
        totalLots: lots.length,
        openLots: lots.filter(l => l.status === 'OPEN').length,
        totalCostBasis,
        bySymbol,
      };
    } catch (error) {
      console.error('[HIFO] Error getting lot summary:', error);
      throw error;
    }
  }
}

export default new HIFOLotService();

