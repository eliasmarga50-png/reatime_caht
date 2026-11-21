import mongoose from 'mongoose';

const wsTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
    },

    ticketHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

wsTicketSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export const WsTicket = mongoose.model('WsTicket', wsTicketSchema);