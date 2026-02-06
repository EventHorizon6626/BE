import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { Agent } from "../models/agent.js";
import { Horizon } from "../models/horizon.js";

const router = express.Router();

// POST /api/agents/generate-prompt - Generate system prompt from description
// (defined before /:id to avoid path conflict)
router.post("/generate-prompt", requireAuth, async (req, res) => {
  try {
    const { name, description, team, category } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Name is required",
      });
    }

    const AI_SERVER_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

    const response = await fetch(
      `${AI_SERVER_URL}/agents/generate-system-prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description || "",
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

    // Validate that system prompt was generated
    if (!data.system_prompt || data.system_prompt.trim() === "") {
      throw new Error("AI service returned empty system prompt");
    }

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

// GET /api/agents/horizon/:horizonId - Get agents by horizon
// (defined before /:id to avoid path conflict)
router.get("/horizon/:horizonId", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { horizonId } = req.params;
    const { system } = req.query;

    const horizon = await Horizon.findOne({
      _id: horizonId,
      userId,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found or access denied",
      });
    }

    const agents = await Agent.findByHorizon(horizonId, { system });

    return res.status(200).json({
      success: true,
      data: agents.map((a) => a.toJSON()),
      count: agents.length,
    });
  } catch (error) {
    console.error("Error fetching agents by horizon:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve agents",
      details: error.message,
    });
  }
});

// GET /api/agents/team/:teamId - Get agents by team
// (defined before /:id to avoid path conflict)
router.get("/team/:teamId", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;

    const agents = await Agent.findByTeam(teamId);

    return res.status(200).json({
      success: true,
      data: agents.map((a) => a.toJSON()),
      count: agents.length,
    });
  } catch (error) {
    console.error("Error fetching agents by team:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve team agents",
      details: error.message,
    });
  }
});

// GET /api/agents - List user's agents
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;

    const agents = await Agent.find({
      userId,
      isActive: true,
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
      isActive: true,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

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

// POST /api/agents - Create agent
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
      horizonId,
      teamId,
      model,
      icon,
      color,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Agent name is required",
      });
    }

    // System prompt is now optional - frontend will auto-generate if needed
    // No validation required here

    // Verify horizon ownership when horizonId is provided
    if (horizonId) {
      const horizon = await Horizon.findOne({
        _id: horizonId,
        userId,
        isActive: true,
      });

      if (!horizon) {
        return res.status(404).json({
          success: false,
          error: "Horizon not found or access denied",
        });
      }
    }

    const agent = new Agent({
      userId,
      horizonId: horizonId || undefined,
      teamId: teamId && mongoose.Types.ObjectId.isValid(teamId) ? teamId : undefined,
      name: name.trim(),
      description: description || "",
      type: type || "custom_agent",
      category: category || "custom_analyzer",
      system: system || "data",
      stage: stage || "",
      model: model || "gpt-4",
      icon: icon || "MdSmartToy",
      color: color || "blue",
      systemPrompt: systemPrompt ? systemPrompt.trim() : "",
      enableThinking: enableThinking ?? false,
      maxIterations: maxIterations ?? 5,
      config: config || {},
      isActive: true,
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
      isActive: true,
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
      model,
      icon,
      color,
      teamId,
    } = req.body;

    if (name !== undefined) agent.name = name.trim();
    if (description !== undefined) agent.description = description;
    if (type !== undefined) agent.type = type;
    if (category !== undefined) agent.category = category;
    if (system !== undefined) agent.system = system;
    if (stage !== undefined) agent.stage = stage;

    // System prompt is optional - can be auto-generated
    if (systemPrompt !== undefined) {
      agent.systemPrompt = systemPrompt;
    }

    if (enableThinking !== undefined) agent.enableThinking = enableThinking;
    if (maxIterations !== undefined) agent.maxIterations = maxIterations;
    if (config !== undefined) agent.config = config;
    if (model !== undefined) agent.model = model;
    if (icon !== undefined) agent.icon = icon;
    if (color !== undefined) agent.color = color;
    if (teamId !== undefined) agent.teamId = teamId;

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
      isActive: true,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    agent.isActive = false;
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

// POST /api/agents/:id/restore - Restore soft-deleted agent
router.post("/:id/restore", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const agent = await Agent.findOne({
      _id: id,
      userId,
      isActive: false,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Deleted agent not found",
      });
    }

    agent.isActive = true;
    await agent.save();

    return res.status(200).json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("Error restoring agent:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to restore agent",
      details: error.message,
    });
  }
});

export default router;
