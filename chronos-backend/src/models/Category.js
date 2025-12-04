import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const categorySchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        color: { type: String, required: true, trim: true },
        user: { type: Types.ObjectId, ref: 'User', default: null, index: true },
        builtInKey: {
            type: String,
            enum: ['task', 'reminder', 'arrangement', 'holiday', null],
            default: null,
            index: true,
        },
    },
    { timestamps: true }
);

export default model('Category', categorySchema);
