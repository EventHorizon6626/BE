import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Agent } from "../models/agent.js";

const router = express.Router();

// GET /api/agents - List user's agents
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;

    const agents = await Agent.find({
      userId,
      status: { $ne: "deleted" },
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: agents.map((a) => a.toJSON()),
    });
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/agents/:id - Get single agent
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const agent = await Agent.findOne({
      _id: req.params.id,
      status: { $ne: "deleted" },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Check ownership or public access
    if (agent.userId.toString() !== userId && !agent.isPublic) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    res.json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/agents - Create custom agent
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      name,
      description,
      type,
      category,
      system,
      stage,
      systemPrompt,
      enableThinking,
      maxIterations,
      config,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Agent name is required",
      });
    }

    if (!systemPrompt || !systemPrompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "System prompt is required",
      });
    }

    const agent = new Agent({
      userId,
      name: name.trim(),
      description: description || "",
      type: type || "custom_agent",
      category: category || "custom_analyzer",
      system: system || "System 2",
      stage: stage || "Team 1",
      systemPrompt: systemPrompt.trim(),
      enableThinking: enableThinking !== false, // Default to true
      maxIterations: maxIterations || 5,
      // Default LLM config - Google Gemini (hidden from user)
      llmConfig: {
        provider: "google",
        deepThinkModel: "gemini-1.5-pro",
        quickThinkModel: "gemini-2.0-flash",
        temperature: 0.7,
        maxTokens: 4000,
      },
      config: config || {},
      status: "active",
    });

    await agent.save();

    res.status(201).json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// PUT /api/agents/:id - Update agent
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId,
      status: { $ne: "deleted" },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    const {
      name,
      description,
      type,
      category,
      system,
      stage,
      systemPrompt,
      enableThinking,
      maxIterations,
      config,
      status,
    } = req.body;

    if (name !== undefined) agent.name = name.trim();
    if (description !== undefined) agent.description = description;
    if (type !== undefined) agent.type = type;
    if (category !== undefined) agent.category = category;
    if (system !== undefined) agent.system = system;
    if (stage !== undefined) agent.stage = stage;
    if (systemPrompt !== undefined) agent.systemPrompt = systemPrompt;
    if (enableThinking !== undefined) agent.enableThinking = enableThinking;
    if (maxIterations !== undefined) agent.maxIterations = maxIterations;
    if (config !== undefined) agent.config = config;
    if (status !== undefined && status !== "deleted") agent.status = status;

    await agent.save();

    res.json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// DELETE /api/agents/:id - Soft delete agent
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const agent = await Agent.findOne({
      _id: req.params.id,
      userId,
      status: { $ne: "deleted" },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    agent.status = "deleted";
    await agent.save();

    res.json({
      success: true,
      message: "Agent deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/agents/generate-prompt - Generate system prompt from description
router.post("/generate-prompt", requireAuth, async (req, res) => {
  try {
    const { name, description, team, category } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        error: "Name and description are required",
      });
    }

    // Call the AI server to generate the system prompt
    const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://localhost:8001";

    const response = await fetch(
      `${AI_SERVER_URL}/agents/generate-system-prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          team: team || "Team 1",
          category: category || "strategy_agent",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to generate system prompt");
    }

    const data = await response.json();

    res.json({
      success: true,
      data: {
        systemPrompt: data.system_prompt,
      },
    });
  } catch (error) {
    console.error("Error generating prompt:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
