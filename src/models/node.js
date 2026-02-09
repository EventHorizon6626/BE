import mongoose from "mongoose";

const NodeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    horizonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Horizon",
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["agentNode", "portfolioNode", "teamNode", "customNode", "outputNode", "block"],
      default: "agentNode",
    },

    parentId: {
      type: String,
      default: null,
      index: true,
    },

    // For nodes inside a block
    blockId: {
      type: String,
      default: null,
      index: true,
    },

    inputNodeIds: [{
      type: String,
    }],

    children: [
      {
        type: String,
      },
    ],

    // For block nodes: array of child node IDs (nodes remain as standalone documents)
    childNodeIds: [
      {
        type: String,
      }
    ],

    depth: {
      type: Number,
      default: 0,
    },

    position: {
      x: { type: Number, required: true, default: 0 },
      y: { type: Number, required: true, default: 0 },
    },

    data: {
      agent: mongoose.Schema.Types.Mixed,
      portfolio: mongoose.Schema.Types.Mixed,
      team: mongoose.Schema.Types.Mixed,
      config: mongoose.Schema.Types.Mixed,

      // For outputNode
      result: mongoose.Schema.Types.Mixed, // Agent output data
      agentName: String,
      timestamp: String,
      metadata: mongoose.Schema.Types.Mixed, // symbols, period, etc.

      output: mongoose.Schema.Types.Mixed,
      lastRun: Date,

      onDelete: String,
      onPlay: String,
    },

    selected: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    executionOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

NodeSchema.index({ userId: 1, horizonId: 1 });
NodeSchema.index({ horizonId: 1, parentId: 1 });
NodeSchema.index({ horizonId: 1, type: 1, createdAt: -1 }); // For sorting outputNodes by creation time

NodeSchema.pre("save", async function (next) {
  // OutputNodes don't need parent or depth
  if (this.type === "outputNode") {
    return next();
  }

  // Build depth using parentId
  if (this.isNew || this.isModified("parentId")) {
    if (this.parentId) {
      const parent = await this.constructor.findById(this.parentId);
      if (parent) {
        this.depth = parent.depth + 1;
      }
    } else {
      this.depth = 0;
    }
  }

  next();
});

NodeSchema.statics = {
  async getTree(horizonId) {
    const nodes = await this.find({ 
      horizonId, 
      isActive: true,
      type: { $ne: "outputNode" } // Exclude outputNodes from tree
    }).sort({
      depth: 1,
      executionOrder: 1,
    });

    const nodeMap = {};
    const roots = [];

    nodes.forEach((node) => {
      const nodeId = String(node._id);
      nodeMap[nodeId] = {
        ...node.toJSON(),
        children: [],
      };
    });

    nodes.forEach((node) => {
      const nodeId = String(node._id);
      const parentId = String(node.parentId);
      
      if (node.parentId && nodeMap[parentId]) {
        nodeMap[parentId].children.push(nodeMap[nodeId]);
      } else {
        roots.push(nodeMap[nodeId]);
      }
    });

    return roots;
  },
  async findDescendants(nodeId, horizonId) {
    const descendants = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      
      // Find all children of current node
      const children = await this.find({
        horizonId,
        parentId: currentNodeId,
        isActive: true,
      }).select('_id');

      // Add children to descendants and queue
      children.forEach((child) => {
        const childId = String(child._id);
        descendants.push(childId);
        queue.push(childId);
      });
    }

    return descendants;
  },
};

export const Node =
  mongoose.models.Node || mongoose.model("Node", NodeSchema);
