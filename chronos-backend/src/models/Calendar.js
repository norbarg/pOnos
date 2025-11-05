import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const calendarSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#3b82f6", trim: true },
    description: { type: String, trim: true },
    owner: { type: Types.ObjectId, ref: "User", required: true },
    members: [{ type: Types.ObjectId, ref: "User" }],
    isMain: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false }, // на будущее: праздники
  },
  { timestamps: true }
);

// У владельца не должно быть двух календарей с одинаковым именем
calendarSchema.index({ owner: 1, name: 1 }, { unique: true });

export default model("Calendar", calendarSchema);