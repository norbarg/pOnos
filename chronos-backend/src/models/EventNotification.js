import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const eventNotificationSchema = new Schema(
    {
        event: {
            type: Types.ObjectId,
            ref: 'Event',
            required: true,
            index: true,
        },
        occurrenceStart: { type: Date, required: true, index: true },
        user: {
            type: Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        kind: {
            type: String,
            enum: ['before15', 'start', 'end'],
            required: true,
            index: true,
        },
        sentAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

eventNotificationSchema.index(
    { event: 1, occurrenceStart: 1, user: 1, kind: 1 },
    { unique: true, name: 'uniq_event_occ_user_kind' }
);

export default model('EventNotification', eventNotificationSchema);
