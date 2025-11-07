import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const placementSchema = new Schema(
    {
        user: { type: Types.ObjectId, ref: 'User', required: true },
        calendar: { type: Types.ObjectId, ref: 'Calendar', required: true },
    },
    { _id: false }
);

const eventSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        start: { type: Date, required: true },
        end: { type: Date, required: true },

        category: { type: Types.ObjectId, ref: 'Category', required: true },

        // основной календарь владельца события
        calendar: { type: Types.ObjectId, ref: 'Calendar', required: true },

        // персональные размещения участников
        placements: { type: [placementSchema], default: [] },

        owner: { type: Types.ObjectId, ref: 'User', required: true },
        participants: [{ type: Types.ObjectId, ref: 'User' }],

        recurrence: {
            rrule: { type: String },
            timezone: { type: String },
            until: { type: Date },
        },
    },
    { timestamps: true }
);

// индексы
eventSchema.index({ calendar: 1, start: 1 });
eventSchema.index({ owner: 1, start: 1 });
eventSchema.index({ owner: 1, category: 1 });
eventSchema.index({ 'placements.user': 1 });
eventSchema.index({ 'placements.calendar': 1 });

export default model('Event', eventSchema);
