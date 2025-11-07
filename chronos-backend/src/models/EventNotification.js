import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

/** Фиксируем, что мы уже отправили уведомление user'у
 * по конкретному событию/оккурансу и виду (before15|start).
 * Уникальный ключ защищает от дублей даже при перезапусках.
 */
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
            enum: ['before15', 'start'],
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
