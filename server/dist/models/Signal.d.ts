import mongoose, { Document } from 'mongoose';
export interface ISignal extends Document {
    symbol: string;
    playbook: 'A' | 'B' | 'C' | 'D';
    action: 'EXECUTED' | 'SKIPPED';
    reason?: string;
    entry_price?: number;
    timestamp: Date;
    userId: mongoose.Types.ObjectId;
}
declare const Signal: mongoose.Model<ISignal, {}, {}, {}, mongoose.Document<unknown, {}, ISignal, {}, {}> & ISignal & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default Signal;
//# sourceMappingURL=Signal.d.ts.map