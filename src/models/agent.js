// src/models/agent.js
import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    // Owner
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Horizon context (optional - agents can be global or horizon-specific)
    horizonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Horizon",
      required: false,
      index: true
    },

    // Basic Info
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, required: true }, // e.g., "custom_analyst", "custom_researcher", "candlestick", "earnings"

    // Classification
    category: {
      type: String,
      enum: [
        // Analyzer categories (System 2)
        "market_analyzer",
        "risk_analyzer",
        "bull_bear_analyzer",
        "sentiment_analyzer",
        "technical_analyzer",
        "fundamental_analyzer",
        "custom_analyzer",
        // Data agent categories (System 1)
        "data_retriever",
        "news_agent",
        "technical_agent",
        "financial_metrics",
        "api_connector",
        // Legacy/other
        "strategy_agent",
        "risk_manager",
        "researcher"
      ],
      default: "custom_analyzer"
    },
    system: {
      type: String,
      enum: ["data", "analyzer"],
      default: "data"
    },

    // UI Properties
    icon: { type: String, default: "MdSmartToy" },
    color: { type: String, default: "blue" },
    isBuiltin: { type: Boolean, default: false },

    // LLM Configuration
    model: { 
      type: String, 
      default: "gpt-4",
      enum: ["gpt-4", "gpt-4-turbo", "claude-3-opus", "claude-3-sonnet"]
    },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    maxTokens: { type: Number, default: 4000 },

    // The core instruction for the agent
    systemPrompt: { type: String, default: "" },

    // Thinking mode configuration
    enableThinking: { type: Boolean, default: false },
    maxIterations: { type: Number, default: 5, min: 1, max: 20 },
    stage: { type: String, default: "" },

    // Agent-specific configuration
    config: {
      type: Object,
      default: {}
    },

    // Soft delete
    isActive: {
      type: Boolean,
      default: true
    },

    // Usage stats
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },

    // Sharing (future feature)
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for efficient queries
AgentSchema.index({ userId: 1, horizonId: 1 });
AgentSchema.index({ userId: 1, isActive: 1 });
AgentSchema.index({ horizonId: 1, system: 1, isActive: 1 });

// Transform for JSON response
AgentSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

// Static methods
AgentSchema.statics.findByHorizon = async function(horizonId, options = {}) {
  const { system, includeInactive = false } = options;

  const query = {
    horizonId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(system ? { system } : {}),
  };

  const agents = await this.find(query).sort({ createdAt: -1 });
  return agents;
};

AgentSchema.statics.findByUser = async function(userId, options = {}) {
  const { page = 1, limit = 20, includeInactive = false } = options;

  const query = {
    userId,
    ...(includeInactive ? {} : { isActive: true }),
  };

  const [agents, total] = await Promise.all([
    this.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    this.countDocuments(query),
  ]);

  return {
    agents,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export const Agent = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);
