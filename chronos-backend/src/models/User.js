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
        name: {
            type: String,
            trim: true,
            lowercase: true,
            unique: true,
            sparse: true,
            validate: {
                validator(v) {
                    if (!v) return true;
                    return /^[a-z0-9._-]{3,32}$/.test(v);
                },
                message:
                    'name must be 3-32 chars, allowed: a-z, 0-9, dot, underscore, hyphen',
            },
        },
        passwordHash: { type: String, required: true },
        avatar: { type: String, trim: true },

        countryCode: {
            type: String,
            trim: true,
            uppercase: true,
            minlength: 2,
            maxlength: 2,
            default: 'UA',
        },
    },
    { timestamps: true }
);

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    return obj;
};

export default mongoose.model('User', userSchema);
