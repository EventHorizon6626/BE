import express from "express";
import { Team } from "../models/team.js";
import { Agent } from "../models/agent.js";
import { Horizon } from "../models/horizon.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

const checkHorizonAccess = async (req, res, next) => {
  try {
    const { horizonId } = req.body.horizonId ? req.body : req.params;

    const horizon = await Horizon.findOne({
      _id: horizonId,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found or access denied",
      });
    }

    req.horizon = horizon;
    next();
  } catch (error) {
    console.error("[Team] Check horizon access error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to verify horizon access",
    });
  }
};

router.post("/", requireAuth, checkHorizonAccess, async (req, res) => {
  try {
    const { horizonId, name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Team name is required",
      });
    }

    const team = new Team({
      userId: req.auth.userId,
      horizonId,
      name: name.trim(),
      description: description?.trim() || "",
    });

    await team.save();

    return res.status(201).json({
      success: true,
      data: team,
      message: "Team created successfully",
    });
  } catch (error) {
    console.error("[Team] Create error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create team",
      details: error.message,
    });
  }
});

router.get("/horizon/:horizonId", requireAuth, async (req, res) => {
  try {
    const { horizonId } = req.params;

    const horizon = await Horizon.findOne({
      _id: horizonId,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!horizon) {
      return res.status(404).json({
        success: false,
        error: "Horizon not found or access denied",
      });
    }

    const teams = await Team.findByHorizon(horizonId);

    return res.status(200).json({
      success: true,
      data: teams,
      count: teams.length,
    });
  } catch (error) {
    console.error("[Team] Get by horizon error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve teams",
      details: error.message,
    });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const result = await Team.findByUser(req.auth.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      success: true,
      data: result.teams,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[Team] Get by user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve teams",
      details: error.message,
    });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: "Team not found",
      });
    }

    const agents = await Agent.findByTeam(id);

    const teamData = team.toJSON();
    teamData.agents = agents;

    return res.status(200).json({
      success: true,
      data: teamData,
    });
  } catch (error) {
    console.error("[Team] Get by ID error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve team",
      details: error.message,
    });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const team = await Team.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: "Team not found",
      });
    }

    if (name !== undefined) {
      team.name = name.trim();
    }

    if (description !== undefined) {
      team.description = description.trim();
    }

    await team.save();

    return res.status(200).json({
      success: true,
      data: team,
      message: "Team updated successfully",
    });
  } catch (error) {
    console.error("[Team] Update error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update team",
      details: error.message,
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: "Team not found",
      });
    }

    team.isActive = false;
    await team.save();

    await Agent.updateMany({ teamId: id }, { $set: { isActive: false } });

    return res.status(200).json({
      success: true,
      message: "Team and its agents deleted successfully",
    });
  } catch (error) {
    console.error("[Team] Delete error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete team",
      details: error.message,
    });
  }
});

router.post("/:id/restore", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: false,
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: "Team not found or already active",
      });
    }

    team.isActive = true;
    await team.save();

    await Agent.updateMany({ teamId: id }, { $set: { isActive: true } });

    return res.status(200).json({
      success: true,
      data: team,
      message: "Team and its agents restored successfully",
    });
  } catch (error) {
    console.error("[Team] Restore error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to restore team",
      details: error.message,
    });
  }
});

export default router;
