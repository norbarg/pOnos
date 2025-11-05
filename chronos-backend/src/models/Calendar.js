import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

// Поддерживаем роли участников календаря
const memberSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["editor", "member"], default: "member" },
  },
  { _id: false }
);

const calendarSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#3b82f6", trim: true },
    description: { type: String, trim: true },
    owner: { type: Types.ObjectId, ref: "User", required: true },
    /**
     * В НОВОЙ СХЕМЕ: массив объектов { user, role }.
     * НО! На ранних этапах у нас уже могли быть записи вида members: [ObjectId].
     * Контроллеры/ACL умеют читать обе формы (для обратной совместимости).
     */
    members: { type: [memberSchema], default: [] },
    isMain: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false }, // для праздников и т.п.
  },
  { timestamps: true }
);

// У владельца не должно быть двух календарей с одинаковым именем
calendarSchema.index({ owner: 1, name: 1 }, { unique: true });

// Уникальность участника в массиве членов (не жёсткий индекс; контролируем в коде)
export default model("Calendar", calendarSchema);