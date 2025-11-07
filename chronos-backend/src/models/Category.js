import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

/**
 * Категория: либо общая (user=null, builtInKey из фиксированного списка),
 * либо пользовательская (user=ObjectId). Дубликаты названий разрешены.
 */
const categorySchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        color: { type: String, required: true, trim: true }, // HEX
        user: { type: Types.ObjectId, ref: 'User', default: null, index: true },
        builtInKey: {
            type: String,
            enum: ['task', 'reminder', 'arrangement', null],
            default: null,
            index: true,
        },
    },
    { timestamps: true }
);

// никаких unique-индексов по названию
export default model('Category', categorySchema);
