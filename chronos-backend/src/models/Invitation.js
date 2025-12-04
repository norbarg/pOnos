import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const invitationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    calendar: { type: Types.ObjectId, ref: "Calendar", required: true, index: true },
    inviter: { type: Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["member", "editor"], default: "member" },
    token: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    acceptedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default model("Invitation", invitationSchema);