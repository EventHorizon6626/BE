import mongoose from "mongoose";

const EmailTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: true,
    },
    type: { type: String, enum: ["verify", "reset"], required: true },
    tokenHash: { type: String, index: true, required: true },
    expiresAt: { type: Date, index: true, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

EmailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

export const EmailToken = mongoose.model("EmailToken", EmailTokenSchema);
