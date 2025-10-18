import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    side: {
        type: String,
        enum: ['LONG', 'SHORT'],
        required: true,
    },
    entry_price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    stop_price: {
        type: Number,
        required: true,
    },
    target_price: {
        type: Number,
    },
    trailing_stop_distance: {
        type: Number,
    },
    playbook: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ['OPEN', 'CLOSED'],
        default: 'OPEN',
        required: true,
        index: true,
    },
    opened_at: {
        type: Date,
        default: Date.now,
        required: true,
    },
    closed_at: {
        type: Date,
    },
    realized_pnl: {
        type: Number,
    },
    realized_r: {
        type: Number,
    },
    fees_paid: {
        type: Number,
        default: 0,
    },
    current_price: {
        type: Number,
    },
    unrealized_pnl: {
        type: Number,
    },
    unrealized_r: {
        type: Number,
    },
    hold_time: {
        type: String,
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
// Index for efficient queries on active positions
schema.index({ userId: 1, status: 1 });
const Position = mongoose.model('Position', schema);
export default Position;
//# sourceMappingURL=Position.js.map