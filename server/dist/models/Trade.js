import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    side: {
        type: String,
        enum: ['BUY', 'SELL'],
        required: true,
    },
    playbook: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true,
        index: true,
    },
    entry_price: {
        type: Number,
        required: true,
    },
    exit_price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    pnl_usd: {
        type: Number,
        required: true,
    },
    pnl_r: {
        type: Number,
        required: true,
    },
    fees: {
        type: Number,
        required: true,
        default: 0,
    },
    hold_time: {
        type: String,
        required: true,
    },
    outcome: {
        type: String,
        enum: ['WIN', 'LOSS', 'BREAKEVEN'],
        required: true,
        index: true,
    },
    notes: {
        type: String,
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
}, {
    versionKey: false,
    timestamps: false,
});
// Compound indexes for efficient queries
schema.index({ userId: 1, date: -1 });
schema.index({ userId: 1, playbook: 1 });
schema.index({ userId: 1, outcome: 1 });
const Trade = mongoose.model('Trade', schema);
export default Trade;
//# sourceMappingURL=Trade.js.map