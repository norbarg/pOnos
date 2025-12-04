import mongoose from 'mongoose';

const { Schema } = mongoose;

const calendarSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        color: { type: String, default: '#151726' },
        description: { type: String, trim: true },

        owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },

        members: [{ type: Schema.Types.ObjectId, ref: 'User' }],

        memberRoles: {
            type: Map,
            of: String,
            default: {},
        },
        notifyActive: {
            type: Map,
            of: Boolean,
            default: {},
        },

        isMain: { type: Boolean, default: false },
        isSystem: { type: Boolean, default: false },
        systemType: { type: String, enum: ['holidays'], default: undefined },
        countryCode: { type: String, trim: true },
    },
    { timestamps: true }
);

calendarSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model('Calendar', calendarSchema);
