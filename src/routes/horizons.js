import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Horizon } from "../models/horizon.js";
import { Node } from "../models/node.js";
import { Portfolio } from "../models/portfolio.js";
import { Agent } from "../models/agent.js";

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

    // Load nodes from Node collection instead of horizon.nodes
    const nodes = await Node.find({
      horizonId: horizon._id,
      isActive: true,
    }).sort({ createdAt: 1 });
    console.log(`Loaded ${nodes.length} nodes for horizon ${horizon._id}`);

    const portfolios = await Portfolio.findByHorizon(horizon._id);

    // Fetch agents by system type
    const dataAgents = await Agent.findByHorizon(horizon._id, {
      system: "data",
    });
    const analyzerAgents = await Agent.findByHorizon(horizon._id, {
      system: "analyzer",
    });

    const horizonData = horizon.toJSON();

    // Map nodes to React Flow format
    horizonData.nodes = nodes.map((node) => ({
      id: String(node._id),
      type: node.type,
      position: node.position,
      data: node.data,
      selected: node.selected || false,
      parentId: node.parentId ? String(node.parentId) : null,
      inputNodeIds: (node.inputNodeIds || []).map(String),
    }));
    horizonData.portfolios = portfolios.map((p) => ({
      id: String(p._id),
      name: p.name,
      description: p.description,
      stocks: p.stocks,
      createdAt: p.createdAt,
    }));

    // System 1: Data Agents
    horizonData.dataAgents = dataAgents.map((agent) => ({
      id: String(agent._id),
      name: agent.name,
      type: agent.type,
      system: agent.system,
      category: agent.category,
      icon: agent.icon,
      color: agent.color,
      isBuiltin: agent.isBuiltin,
      description: agent.description,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      enableThinking: agent.enableThinking,
      maxIterations: agent.maxIterations,
    }));

    // System 2: Analyzer Agents
    horizonData.analyzerAgents = analyzerAgents.map((agent) => ({
      id: String(agent._id),
      name: agent.name,
      type: agent.type,
      system: agent.system,
      category: agent.category,
      icon: agent.icon,
      color: agent.color,
      isBuiltin: agent.isBuiltin,
      description: agent.description,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      enableThinking: agent.enableThinking,
      maxIterations: agent.maxIterations,
    }));

    // Backward compatibility: availableAgents = dataAgents
    horizonData.availableAgents = horizonData.dataAgents;

    horizonData.customAgents = [...dataAgents, ...analyzerAgents]
      .filter((agent) => !agent.isBuiltin)
      .map((agent) => ({
        id: String(agent._id),
        name: agent.name,
        type: agent.type,
        system: agent.system,
        category: agent.category,
        icon: agent.icon,
        color: agent.color,
        isBuiltin: agent.isBuiltin,
        description: agent.description,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        enableThinking: agent.enableThinking,
        maxIterations: agent.maxIterations,
      }));

    // Auto-generate edges from nodes based on parentId relationships
    horizonData.edges = Horizon.buildEdgesFromNodes(nodes);
    console.log(`Generated ${horizonData.edges.length} edges from node relationships`);

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
      // edges are auto-generated, no need to accept from client
      availableAgents,
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
      // edges removed - will be auto-generated from nodes
      availableAgents: availableAgents || [],
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
      // edges are auto-generated, no need to accept from client
      availableAgents,
      customAgents,
      portfolios,
      tags,
      viewport,
      isPublic,
    } = req.body;

    if (name !== undefined) horizon.name = name.trim();
    if (description !== undefined) horizon.description = description;
    
    // Handle nodes: sync to Node collection instead of horizon.nodes
    if (nodes !== undefined) {
      // Get ALL existing nodes (including outputNodes)
      const existingNodes = await Node.find({
        horizonId: horizon._id,
        isActive: true,
        // ✅ Include ALL node types including outputNodes
      });
      
      const existingNodeIds = new Set(existingNodes.map((n) => String(n._id)));
      const newNodeIds = new Set(nodes.map((n) => n.id));
      
      // Delete nodes that no longer exist in FE
      const nodesToDelete = Array.from(existingNodeIds).filter(
        (id) => !newNodeIds.has(id)
      );
      if (nodesToDelete.length > 0) {
        await Node.updateMany(
          { _id: { $in: nodesToDelete } },
          { $set: { isActive: false } }
        );
      }
      
      // Upsert nodes (create or update)
      const bulkOps = nodes.map((node) => ({
        updateOne: {
          filter: {
            _id: node.id,
            userId,
            horizonId: horizon._id,
          },
          update: {
            $set: {
              type: node.type,
              position: node.position,
              data: node.data,
              selected: node.selected || false,
              isActive: true,
            },
          },
          upsert: false, // Don't auto-create, node must exist
        },
      }));
      
      // Create new nodes that don't exist yet
      const newNodes = nodes.filter((node) => !existingNodeIds.has(node.id));
      if (newNodes.length > 0) {
        await Node.insertMany(
          newNodes.map((node) => ({
            _id: node.id, // Use FE-provided ID
            userId,
            horizonId: horizon._id,
            type: node.type,
            position: node.position,
            data: node.data,
            selected: node.selected || false,
            isActive: true,
          }))
        );
      }
      
      if (bulkOps.length > 0) {
        await Node.bulkWrite(bulkOps);
      }
    }
    
    // Note: edges are auto-generated from nodes' parentId, no need to save
    if (availableAgents !== undefined)
      horizon.availableAgents = availableAgents;
    if (customAgents !== undefined) horizon.customAgents = customAgents;
    if (portfolios !== undefined) horizon.portfolios = portfolios;
    if (tags !== undefined) horizon.tags = tags;
    if (viewport !== undefined) horizon.viewport = viewport;
    if (isPublic !== undefined) horizon.isPublic = isPublic;

    // Update stats
    const nodeCount = await Node.countDocuments({
      horizonId: horizon._id,
      isActive: true,
    });
    horizon.stats.nodeCount = nodeCount;
    // edgeCount will be calculated dynamically from nodes' parentId relationships
    const edgeCount = await Node.countDocuments({
      horizonId: horizon._id,
      isActive: true,
      parentId: { $ne: null },
    });
    horizon.stats.edgeCount = edgeCount;

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
