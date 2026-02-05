import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Agent } from "../models/agent.js";
import { Horizon } from "../models/horizon.js";

const router = express.Router();

// POST /api/horizon-agents - Create agent for horizon
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      horizonId,
      name,
      description,
      type,
      category,
      system,
      teamId,
      model,
      icon,
      color,
    } = req.body;

    if (!horizonId) {
      return res.status(400).json({
        success: false,
        error: "Horizon ID is required",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Agent name is required",
      });
    }

    // Verify horizon ownership
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

    const agent = new Agent({
      userId,
      horizonId,
      teamId: teamId || null,
      name: name.trim(),
      description: description || "",
      type: type || "custom_agent",
      category: category || "custom_analyzer",
      system: system || "data",
      model: model || "gpt-4",
      icon: icon || "MdSmartToy",
      color: color || "blue",
      isActive: true,
    });

    await agent.save();

    return res.status(201).json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("[HorizonAgent] Create error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create agent",
      details: error.message,
    });
  }
});

// GET /api/horizon-agents/horizon/:horizonId - Get agents by horizon
router.get("/horizon/:horizonId", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { horizonId } = req.params;
    const { system } = req.query; // Optional filter: "data" or "team"

    // Verify horizon ownership
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
      data: agents.map(a => a.toJSON()),
      count: agents.length,
    });
  } catch (error) {
    console.error("[HorizonAgent] Get by horizon error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve agents",
      details: error.message,
    });
  }
});

// GET /api/horizon-agents/team/:teamId - Get agents by team
router.get("/team/:teamId", requireAuth, async (req, res) => {
  try {
    const { teamId } = req.params;

    const agents = await Agent.findByTeam(teamId);

    return res.status(200).json({
      success: true,
      data: agents.map(a => a.toJSON()),
      count: agents.length,
    });
  } catch (error) {
    console.error("[HorizonAgent] Get by team error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve team agents",
      details: error.message,
    });
  }
});

// GET /api/horizon-agents/:id - Get single agent
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const agent = await Agent.findOne({
      _id: id,
      userId,
      isActive: true,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("[HorizonAgent] Get error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve agent",
      details: error.message,
    });
  }
});

// PUT /api/horizon-agents/:id - Update agent
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const {
      name,
      description,
      type,
      category,
      system,
      teamId,
      model,
      icon,
      color,
    } = req.body;

    const agent = await Agent.findOne({
      _id: id,
      userId,
      isActive: true,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Update fields
    if (name !== undefined) agent.name = name.trim();
    if (description !== undefined) agent.description = description;
    if (type !== undefined) agent.type = type;
    if (category !== undefined) agent.category = category;
    if (system !== undefined) agent.system = system;
    if (teamId !== undefined) agent.teamId = teamId;
    if (model !== undefined) agent.model = model;
    if (icon !== undefined) agent.icon = icon;
    if (color !== undefined) agent.color = color;

    await agent.save();

    return res.status(200).json({
      success: true,
      data: agent.toJSON(),
    });
  } catch (error) {
    console.error("[HorizonAgent] Update error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update agent",
      details: error.message,
    });
  }
});

// DELETE /api/horizon-agents/:id - Soft delete agent
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const agent = await Agent.findOne({
      _id: id,
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

    return res.status(200).json({
      success: true,
      message: "Agent deleted successfully",
    });
  } catch (error) {
    console.error("[HorizonAgent] Delete error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete agent",
      details: error.message,
    });
  }
});

// POST /api/horizon-agents/:id/restore - Restore soft-deleted agent
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
    console.error("[HorizonAgent] Restore error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to restore agent",
      details: error.message,
    });
  }
});

export default router;
