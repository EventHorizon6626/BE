import mongoose from "mongoose";

const JobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    horizonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Horizon",
      index: true,
    },

    agentNodeId: {
      type: String,
      index: true,
    },

    agentType: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      required: true,
      index: true,
    },

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    requestData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    error: {
      message: String,
      stack: String,
      code: String,
    },

    metadata: {
      provider: String,
      startedAt: Date,
      completedAt: Date,
      duration: Number, // in milliseconds
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
JobSchema.index({ userId: 1, createdAt: -1 });
JobSchema.index({ status: 1, createdAt: -1 });
JobSchema.index({ agentType: 1, status: 1 });

export const Job = mongoose.model("Job", JobSchema);
