import mongoose, { Document } from 'mongoose';
export interface ITrade extends Document {
    symbol: string;
    side: 'BUY' | 'SELL';
    playbook: 'A' | 'B' | 'C' | 'D';
    entry_price: number;
    exit_price: number;
    quantity: number;
    pnl_usd: number;
    pnl_r: number;
    fees: number;
    hold_time: string;
    outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
    notes?: string;
    date: Date;
    userId: mongoose.Types.ObjectId;
}
declare const Trade: mongoose.Model<ITrade, {}, {}, {}, mongoose.Document<unknown, {}, ITrade, {}, {}> & ITrade & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default Trade;
//# sourceMappingURL=Trade.d.ts.map