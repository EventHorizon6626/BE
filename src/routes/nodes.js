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
      type,
      parentId,
      position,
      data,
      executionOrder,
      inputNodeIds,
    } = req.body;

    if (!horizonId || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: horizonId, type",
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

    const node = new Node({
      userId,
      horizonId,
      type,
      parentId: parentId || null,
      position: position || { x: 0, y: 0 },
      data: data || {},
      executionOrder: executionOrder || 0,
      inputNodeIds: inputNodeIds || [],
    });

    await node.save();

    if (parentId) {
      await Node.findByIdAndUpdate(
        parentId,
        { $addToSet: { children: String(node._id) } }
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

    const { type, parentId, position, data, executionOrder, selected, inputNodeIds } =
      req.body;

    if (type !== undefined) node.type = type;
    if (position !== undefined) node.position = position;
    if (data !== undefined) node.data = data;
    if (executionOrder !== undefined) node.executionOrder = executionOrder;
    if (selected !== undefined) node.selected = selected;
    if (inputNodeIds !== undefined) node.inputNodeIds = inputNodeIds;

    if (parentId !== undefined && parentId !== node.parentId) {
      if (node.parentId) {
        await Node.findByIdAndUpdate(
          node.parentId,
          { $pull: { children: String(node._id) } }
        );
      }

      if (parentId) {
        await Node.findByIdAndUpdate(
          parentId,
          { $addToSet: { children: String(node._id) } }
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

    // Find all descendants using the new recursive method
    const descendantIds = await Node.findDescendants(String(node._id), node.horizonId);
    const nodeIds = [node._id, ...descendantIds];

    await Node.updateMany({ _id: { $in: nodeIds } }, { $set: { isActive: false } });

    if (node.parentId) {
      await Node.findByIdAndUpdate(
        node.parentId,
        { $pull: { children: String(node._id) } }
      );
    }

    horizon.stats.nodeCount = await Node.countDocuments({
      horizonId: node.horizonId,
      isActive: true,
    });
    await horizon.save();

    res.json({
      success: true,
      message: `Node and ${descendantIds.length} descendants deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting node:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// PATCH /nodes/:id/reactivate - Reactivate an output node
router.patch("/:id/reactivate", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    // Find the output node to reactivate
    const outputNode = await Node.findById(id);

    if (!outputNode) {
      return res.status(404).json({
        success: false,
        error: "Output node not found",
      });
    }

    if (outputNode.type !== "outputNode") {
      return res.status(400).json({
        success: false,
        error: "Only output nodes can be reactivated",
      });
    }

    // Check access to horizon
    const horizon = await Horizon.findById(outputNode.horizonId);
    if (!horizon || !horizon.hasAccess(userId, "editor")) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    outputNode.isActive = true;
    await outputNode.save();

    res.json({
      success: true,
      message: "Output node reactivated successfully",
      data: outputNode.toJSON(),
    });
  } catch (error) {
    console.error("Error reactivating output node:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /nodes/by-agent/:agentNodeId - Get all outputNodes for an agent (revisions)
router.get("/by-agent/:agentNodeId", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { agentNodeId } = req.params;
    const { horizonId } = req.query;

    if (!horizonId) {
      return res.status(400).json({
        success: false,
        error: "horizonId query parameter is required",
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

    if (!horizon.hasAccess(userId, "viewer")) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // Get all outputNodes for this agent, sorted by newest first
    const outputNodes = await Node.find({
      horizonId,
      type: "outputNode",
      parentId: agentNodeId,
      // isActive: true,
    })
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    res.json({
      success: true,
      data: {
        agentNodeId,
        total: outputNodes.length,
        outputs: outputNodes,
      },
    });
  } catch (error) {
    console.error("Error fetching nodes by agent:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
