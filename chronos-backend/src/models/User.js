// chronos-backend/src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: { type: String, required: true },
        name: { type: String, trim: true },
    },
    { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

// чтобы пароль не попадал в ответы API
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    return obj;
};

export default mongoose.model('User', userSchema);
