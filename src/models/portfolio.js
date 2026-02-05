import mongoose from "mongoose";

const PortfolioSchema = new mongoose.Schema(
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

    stocks: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    metadata: {
      totalValue: { type: Number, default: 0 },
      lastAnalyzedAt: { type: Date, default: null },
      analysisCount: { type: Number, default: 0 },
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

PortfolioSchema.index({ userId: 1, horizonId: 1 });
PortfolioSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
PortfolioSchema.index({ horizonId: 1, isActive: 1 });

PortfolioSchema.statics = {
  async findByHorizon(horizonId, options = {}) {
    const { includeInactive = false } = options;

    const query = {
      horizonId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const portfolios = await this.find(query).sort({ createdAt: -1 });

    return portfolios;
  },

  async findByUser(userId, options = {}) {
    const { page = 1, limit = 20, includeInactive = false } = options;

    const query = {
      userId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [portfolios, total] = await Promise.all([
      this.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.countDocuments(query),
    ]);

    return {
      portfolios,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },
};

export const Portfolio =
  mongoose.models.Portfolio || mongoose.model("Portfolio", PortfolioSchema);
