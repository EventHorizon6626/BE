import express from "express";
import { Portfolio } from "../models/portfolio.js";
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
    console.error("[Portfolio] Check horizon access error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to verify horizon access",
    });
  }
};

router.post("/", requireAuth, checkHorizonAccess, async (req, res) => {
  try {
    const { horizonId, name, description, stocks } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Portfolio name is required",
      });
    }

    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one stock symbol is required",
      });
    }

    const portfolio = new Portfolio({
      userId: req.auth.userId,
      horizonId,
      name: name.trim(),
      description: description?.trim() || "",
      stocks: stocks.map((s) => s.trim().toUpperCase()).filter(Boolean),
    });

    await portfolio.save();

    return res.status(201).json({
      success: true,
      data: portfolio,
      message: "Portfolio created successfully",
    });
  } catch (error) {
    console.error("[Portfolio] Create error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create portfolio",
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

    const portfolios = await Portfolio.findByHorizon(horizonId);

    return res.status(200).json({
      success: true,
      data: portfolios,
      count: portfolios.length,
    });
  } catch (error) {
    console.error("[Portfolio] Get by horizon error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve portfolios",
      details: error.message,
    });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const result = await Portfolio.findByUser(req.auth.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({
      success: true,
      data: result.portfolios,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[Portfolio] Get by user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve portfolios",
      details: error.message,
    });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: "Portfolio not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: portfolio,
    });
  } catch (error) {
    console.error("[Portfolio] Get by ID error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve portfolio",
      details: error.message,
    });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, stocks } = req.body;

    const portfolio = await Portfolio.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: "Portfolio not found",
      });
    }

    if (name !== undefined) {
      portfolio.name = name.trim();
    }

    if (description !== undefined) {
      portfolio.description = description.trim();
    }

    if (stocks !== undefined) {
      if (!Array.isArray(stocks) || stocks.length === 0) {
        return res.status(400).json({
          success: false,
          error: "At least one stock symbol is required",
        });
      }
      portfolio.stocks = stocks.map((s) => s.trim().toUpperCase()).filter(Boolean);
    }

    await portfolio.save();

    return res.status(200).json({
      success: true,
      data: portfolio,
      message: "Portfolio updated successfully",
    });
  } catch (error) {
    console.error("[Portfolio] Update error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update portfolio",
      details: error.message,
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: true,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: "Portfolio not found",
      });
    }

    portfolio.isActive = false;
    await portfolio.save();

    return res.status(200).json({
      success: true,
      message: "Portfolio deleted successfully",
    });
  } catch (error) {
    console.error("[Portfolio] Delete error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete portfolio",
      details: error.message,
    });
  }
});

router.post("/:id/restore", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.findOne({
      _id: id,
      userId: req.auth.userId,
      isActive: false,
    });

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: "Portfolio not found or already active",
      });
    }

    portfolio.isActive = true;
    await portfolio.save();

    return res.status(200).json({
      success: true,
      data: portfolio,
      message: "Portfolio restored successfully",
    });
  } catch (error) {
    console.error("[Portfolio] Restore error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to restore portfolio",
      details: error.message,
    });
  }
});

export default router;
