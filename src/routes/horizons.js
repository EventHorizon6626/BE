import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Horizon } from "../models/horizon.js";
import { Node } from "../models/node.js";
import { Portfolio } from "../models/portfolio.js";
import { Agent } from "../models/agent.js";
import { Team } from "../models/team.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;

    const horizons = await Horizon.find({
      $or: [
        { userId },
        { "sharedWith.userId": userId },
        { isPublic: true },
      ],
      isActive: true,
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: horizons.map(h => h.toJSON()),
    });
  } catch (error) {
    console.error("Error fetching horizons:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const horizon = await Horizon.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found",
      });
    }

    if (
      horizon.userId.toString() !== userId &&
      !horizon.sharedWith.some(s => s.userId.toString() === userId) &&
      !horizon.isPublic
    ) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const portfolios = await Portfolio.findByHorizon(horizon._id);

    const dataAgents = await Agent.findByHorizon(horizon._id, {
      system: "data",
    });
    const teamAgents = await Agent.findByHorizon(horizon._id, {
      system: "team",
    });

    const teams = await Team.findByHorizon(horizon._id);

    const teamsWithAgents = teams.map((team) => {
      const teamJSON = team.toJSON();
      teamJSON.agents = teamAgents
        .filter((agent) => String(agent.teamId) === String(team._id))
        .map((agent) => agent.toJSON());
      return teamJSON;
    });

    const horizonData = horizon.toJSON();
    horizonData.portfolios = portfolios.map((p) => ({
      id: String(p._id),
      name: p.name,
      description: p.description,
      stocks: p.stocks,
      createdAt: p.createdAt,
    }));

    horizonData.availableAgents = dataAgents.map((agent) => ({
      id: String(agent._id),
      name: agent.name,
      type: agent.type,
      system: agent.system,
      icon: agent.icon,
      color: agent.color,
      isBuiltin: agent.isBuiltin,
      description: agent.description,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      enableThinking: agent.enableThinking,
      maxIterations: agent.maxIterations,
    }));

    horizonData.availableTeams = teamsWithAgents;

    horizonData.customAgents = [...dataAgents, ...teamAgents]
      .filter((agent) => !agent.isBuiltin)
      .map((agent) => ({
        id: String(agent._id),
        name: agent.name,
        type: agent.type,
        system: agent.system,
        teamId: agent.teamId ? String(agent.teamId) : null,
        icon: agent.icon,
        color: agent.color,
        isBuiltin: agent.isBuiltin,
        description: agent.description,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        enableThinking: agent.enableThinking,
        maxIterations: agent.maxIterations,
      }));

    res.json({
      success: true,
      data: horizonData,
    });
  } catch (error) {
    console.error("Error fetching horizon:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      name,
      description,
      nodes,
      edges,
      availableAgents,
      availableTeams,
      customAgents,
      portfolios,
      tags,
      viewport,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Horizon name is required",
      });
    }

    const horizon = new Horizon({
      userId,
      name: name.trim(),
      description: description || "",
      nodes: nodes || [],
      edges: edges || [],
      availableAgents: availableAgents || [],
      availableTeams: availableTeams || [],
      customAgents: customAgents || [],
      portfolios: portfolios || [],
      tags: tags || [],
      viewport: viewport || { x: 0, y: 0, zoom: 0.9 },
    });

    await horizon.save();

    res.status(201).json({
      success: true,
      data: horizon.toJSON(),
    });
  } catch (error) {
    console.error("Error creating horizon:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const horizon = await Horizon.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found",
      });
    }

    if (!horizon.hasAccess(userId, "editor")) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const {
      name,
      description,
      nodes,
      edges,
      availableAgents,
      availableTeams,
      customAgents,
      portfolios,
      tags,
      viewport,
      isPublic,
    } = req.body;

    if (name !== undefined) horizon.name = name.trim();
    if (description !== undefined) horizon.description = description;
    if (nodes !== undefined) horizon.nodes = nodes;
    if (edges !== undefined) horizon.edges = edges;
    if (availableAgents !== undefined)
      horizon.availableAgents = availableAgents;
    if (availableTeams !== undefined) horizon.availableTeams = availableTeams;
    if (customAgents !== undefined) horizon.customAgents = customAgents;
    if (portfolios !== undefined) horizon.portfolios = portfolios;
    if (tags !== undefined) horizon.tags = tags;
    if (viewport !== undefined) horizon.viewport = viewport;
    if (isPublic !== undefined) horizon.isPublic = isPublic;

    await horizon.save();

    res.json({
      success: true,
      data: horizon.toJSON(),
    });
  } catch (error) {
    console.error("Error updating horizon:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const horizon = await Horizon.findOne({
      _id: req.params.id,
      userId,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found",
      });
    }

    horizon.isActive = false;
    await horizon.save();

    await Node.updateMany(
      { horizonId: horizon._id },
      { $set: { isActive: false } }
    );

    res.json({
      success: true,
      message: "Horizon deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting horizon:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
