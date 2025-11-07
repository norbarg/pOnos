// src/models/User.js
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
        // логин / ник
        name: {
            type: String,
            trim: true,
            lowercase: true, // нормализуем
            unique: true, // логин должен быть уникален
            sparse: true, // чтобы пустые значения не ломали уникальный индекс
            validate: {
                validator(v) {
                    if (!v) return true; // можно не задавать сразу
                    return /^[a-z0-9._-]{3,32}$/.test(v);
                },
                message:
                    'name must be 3-32 chars, allowed: a-z, 0-9, dot, underscore, hyphen',
            },
        },
        passwordHash: { type: String, required: true },
        avatar: { type: String, trim: true }, // /uploads/avatars/xxx.png
    },
    { timestamps: true }
);

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    return obj;
};

export default mongoose.model('User', userSchema);
