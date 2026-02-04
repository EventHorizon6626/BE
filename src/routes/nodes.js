import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Node } from "../models/node.js";
import { Horizon } from "../models/horizon.js";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      horizonId,
      nodeId,
      type,
      parentId,
      position,
      data,
      executionOrder,
    } = req.body;

    if (!horizonId || !nodeId || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: horizonId, nodeId, type",
      });
    }

    const horizon = await Horizon.findOne({
      _id: horizonId,
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

    const existing = await Node.findOne({ horizonId, nodeId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Node with this nodeId already exists in this horizon",
      });
    }

    const node = new Node({
      userId,
      horizonId,
      nodeId,
      type,
      parentId: parentId || null,
      position: position || { x: 0, y: 0 },
      data: data || {},
      executionOrder: executionOrder || 0,
    });

    await node.save();

    if (parentId) {
      await Node.findOneAndUpdate(
        { horizonId, nodeId: parentId },
        { $addToSet: { children: nodeId } }
      );
    }

    horizon.stats.nodeCount = await Node.countDocuments({
      horizonId,
      isActive: true,
    });
    await horizon.save();

    res.status(201).json({
      success: true,
      data: node.toJSON(),
    });
  } catch (error) {
    console.error("Error creating node:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const node = await Node.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        error: "Node not found",
      });
    }

    const horizon = await Horizon.findById(node.horizonId);
    if (!horizon || !horizon.hasAccess(userId, "editor")) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const { type, parentId, position, data, executionOrder, selected } =
      req.body;

    if (type !== undefined) node.type = type;
    if (position !== undefined) node.position = position;
    if (data !== undefined) node.data = data;
    if (executionOrder !== undefined) node.executionOrder = executionOrder;
    if (selected !== undefined) node.selected = selected;

    if (parentId !== undefined && parentId !== node.parentId) {
      if (node.parentId) {
        await Node.findOneAndUpdate(
          { horizonId: node.horizonId, nodeId: node.parentId },
          { $pull: { children: node.nodeId } }
        );
      }

      if (parentId) {
        await Node.findOneAndUpdate(
          { horizonId: node.horizonId, nodeId: parentId },
          { $addToSet: { children: node.nodeId } }
        );
      }

      node.parentId = parentId;
    }

    await node.save();

    res.json({
      success: true,
      data: node.toJSON(),
    });
  } catch (error) {
    console.error("Error updating node:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const node = await Node.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        error: "Node not found",
      });
    }

    const horizon = await Horizon.findById(node.horizonId);
    if (!horizon || !horizon.hasAccess(userId, "editor")) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const descendants = await Node.find({
      horizonId: node.horizonId,
      path: new RegExp(`^${node.path}/`),
      isActive: true
    });
    const nodeIds = [node._id, ...descendants.map((d) => d._id)];

    await Node.updateMany({ _id: { $in: nodeIds } }, { $set: { isActive: false } });

    if (node.parentId) {
      await Node.findOneAndUpdate(
        { horizonId: node.horizonId, nodeId: node.parentId },
        { $pull: { children: node.nodeId } }
      );
    }

    horizon.stats.nodeCount = await Node.countDocuments({
      horizonId: node.horizonId,
      isActive: true,
    });
    await horizon.save();

    res.json({
      success: true,
      message: `Node and ${descendants.length} descendants deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting node:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
