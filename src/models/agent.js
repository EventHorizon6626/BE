// src/models/agent.js
import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    // Owner
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Basic Info
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, required: true }, // e.g., "custom_analyst", "custom_researcher"

    // Classification
    category: {
      type: String,
      enum: ["strategy_agent", "risk_manager", "custom_analyzer", "data_retriever", "news_agent", "technical_agent"],
      default: "custom_analyzer"
    },
    system: {
      type: String,
      enum: ["System 1", "System 2"],
      default: "System 2"
    },
    stage: { type: String, default: "Team 1" }, // Team 1-4 for System 2, Stage 1-3 for System 1

    // LLM Configuration (TradingAgents dual-LLM architecture)
    llmConfig: {
      provider: {
        type: String,
        enum: ["google", "openai", "anthropic", "ollama", "xai", "openrouter"],
        default: "google"
      },
      deepThinkModel: { type: String, default: "gemini-1.5-pro" },
      quickThinkModel: { type: String, default: "gemini-2.0-flash" },
      temperature: { type: Number, default: 0.7, min: 0, max: 2 },
      maxTokens: { type: Number, default: 4000 },
    },

    // The core instruction for the agent
    systemPrompt: { type: String, required: true },

    // Thinking Mode Configuration (ReAct-style iterative reasoning)
    enableThinking: { type: Boolean, default: true },
    maxIterations: { type: Number, default: 5, min: 1, max: 10 },

    // Agent-specific configuration
    config: {
      type: Object,
      default: {}
    },

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "draft", "deleted"],
      default: "active"
    },

    // Usage stats
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },

    // Sharing (future feature)
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Index for efficient queries
AgentSchema.index({ userId: 1, status: 1 });
AgentSchema.index({ isPublic: 1, status: 1 });

// Transform for JSON response
AgentSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Agent = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);
