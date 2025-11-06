import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,      // единственный обязательный уникальный идентификатор по почте
      lowercase: true,
      trim: true,
    },

    // Опциональный ник для входа (уникальный, но sparse — пользователи без ника не мешают индексу)
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // необязателен
          return /^[a-z0-9._-]{3,32}$/.test(v);
        },
        message:
          'username must be 3-32 chars, allowed: a-z, 0-9, dot, underscore, hyphen',
      },
    },

    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
  },
  { timestamps: true }
);

// чтобы пароль не попадал в ответы API
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', userSchema);