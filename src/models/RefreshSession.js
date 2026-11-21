import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    familyId: {
      type: String,
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    usedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically clean up expired refresh records.
refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

refreshSessionSchema.index({
  userId: 1,
  familyId: 1,
});

export const RefreshSession = mongoose.model(
  'RefreshSession',
  refreshSessionSchema
);