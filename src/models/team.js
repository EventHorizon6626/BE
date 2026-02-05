import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    metadata: {
      agentCount: { type: Number, default: 0 },
      executionCount: { type: Number, default: 0 },
      lastExecutedAt: { type: Date, default: null },
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

TeamSchema.index({ userId: 1, horizonId: 1 });
TeamSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
TeamSchema.index({ horizonId: 1, isActive: 1 });

TeamSchema.statics = {
  async findByHorizon(horizonId, options = {}) {
    const { includeInactive = false } = options;

    const query = {
      horizonId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const teams = await this.find(query).sort({ createdAt: -1 });

    return teams;
  },

  async findByUser(userId, options = {}) {
    const { page = 1, limit = 20, includeInactive = false } = options;

    const query = {
      userId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [teams, total] = await Promise.all([
      this.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.countDocuments(query),
    ]);

    return {
      teams,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },
};

export const Team = mongoose.models.Team || mongoose.model("Team", TeamSchema);
