import mongoose, { Document } from 'mongoose';
export interface IPosition extends Document {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entry_price: number;
    quantity: number;
    stop_price: number;
    target_price?: number;
    trailing_stop_distance?: number;
    playbook: 'A' | 'B' | 'C' | 'D';
    status: 'OPEN' | 'CLOSED';
    opened_at: Date;
    closed_at?: Date;
    realized_pnl?: number;
    realized_r?: number;
    fees_paid?: number;
    current_price?: number;
    unrealized_pnl?: number;
    unrealized_r?: number;
    hold_time?: string;
    userId: mongoose.Types.ObjectId;
}
declare const Position: mongoose.Model<IPosition, {}, {}, {}, mongoose.Document<unknown, {}, IPosition, {}, {}> & IPosition & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default Position;
//# sourceMappingURL=Position.d.ts.map