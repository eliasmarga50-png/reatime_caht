import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ username: 1 });

export const User = mongoose.model('User', userSchema);