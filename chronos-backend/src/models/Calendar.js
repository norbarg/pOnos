// chronos-backend/src/models/Calendar.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const calendarSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#3b82f6" },
    description: { type: String, trim: true },

    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Участники календаря (члены). Храним как ObjectId[], без поддоков — совместимо со старыми данными.
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Роли участников: Map<userIdString, 'member'|'editor'>
    memberRoles: {
      type: Map,
      of: String,
      default: {},
    },

    // Флаги/типы календарей
    isMain: { type: Boolean, default: false },        // главный личный
    isSystem: { type: Boolean, default: false },      // системный (нельзя CRUD/share)
    systemType: { type: String, enum: ["holidays"], default: undefined },
    countryCode: { type: String, trim: true },        // для системных календарей, например "UA"
  },
  { timestamps: true }
);

// Один и тот же владелец не может иметь 2 календаря с одинаковым именем.
calendarSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model("Calendar", calendarSchema);