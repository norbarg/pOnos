// chronos-backend/src/models/Calendar.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const calendarSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#151726" },
    description: { type: String, trim: true },

    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Участники (старый формат — массив ObjectId, без поддоков)
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Роли участников: Map<userIdString, 'member'|'editor'>
    memberRoles: {
      type: Map,
      of: String,
      default: {},
    },

    // Персональный статус уведомлений: Map<userIdString, boolean>
    // true = этот пользователь получает уведомления по событиям этого календаря
    // По умолчанию считаем true, если записи нет (см. контроллер).
    notifyActive: {
      type: Map,
      of: Boolean,
      default: {},
    },

    // Флаги/типы календарей
    isMain: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    systemType: { type: String, enum: ["holidays"], default: undefined },
    countryCode: { type: String, trim: true },
  },
  { timestamps: true }
);

// Один и тот же владелец не может иметь 2 календаря с одинаковым именем.
calendarSchema.index({ owner: 1, name: 1 }, { unique: true });

export default mongoose.model("Calendar", calendarSchema);