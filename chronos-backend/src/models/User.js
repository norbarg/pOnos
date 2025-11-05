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

    // username (логин): уникален, если указан; хранится в нижнем регистре
    name: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // позволяет иметь много документов без name
    },
  },
  { timestamps: true }
);

// Индексы: unique по email уже создаётся через unique: true выше,
// поэтому отдельная строка ниже НЕ обязательна и её можно удалить.
// userSchema.index({ email: 1 }, { unique: true });

// Добавим индекс и для name (избыточно по сравнению с unique: true, но явно):
userSchema.index({ name: 1 }, { unique: true, sparse: true });

// чтобы пароль не попадал в ответы API
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', userSchema);