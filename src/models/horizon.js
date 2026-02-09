import mongoose from "mongoose";

const HorizonSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    nodes: [
      {
        id: { type: String, required: true },
        type: { type: String, required: true },
        position: {
          x: { type: Number, default: 0 },
          y: { type: Number, default: 0 },
        },
        data: mongoose.Schema.Types.Mixed,
        selected: { type: Boolean, default: false },
        dragging: { type: Boolean, default: false },
      },
    ],

    availableAgents: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        type: String,
        system: { type: String, enum: ["data", "analyzer"], default: "data" },
        category: String,
        icon: String,
        color: String,
        isBuiltin: { type: Boolean, default: false },
        description: String,
        model: String,
        systemPrompt: String,
        enableThinking: Boolean,
        maxIterations: Number,
      },
    ],

    customAgents: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        type: String,
        system: String,
        category: String,
        icon: String,
        color: String,
        isBuiltin: { type: Boolean, default: false },
        description: String,
        model: String,
        systemPrompt: String,
        enableThinking: Boolean,
        maxIterations: Number,
      },
    ],

    portfolios: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        stocks: [String],
        createdAt: Date,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    isPublic: {
      type: Boolean,
      default: false,
    },

    lastExecutedAt: {
      type: Date,
      default: null,
    },

    executionCount: {
      type: Number,
      default: 0,
    },

    viewport: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      zoom: { type: Number, default: 0.9 },
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    stats: {
      nodeCount: { type: Number, default: 0 },
      edgeCount: { type: Number, default: 0 },
      agentCount: { type: Number, default: 0 },
      portfolioCount: { type: Number, default: 0 },
    },

    version: {
      type: Number,
      default: 1,
    },

    sharedWith: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["viewer", "editor"],
          default: "viewer",
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
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

HorizonSchema.index({ userId: 1, createdAt: -1 });
HorizonSchema.index({ userId: 1, name: 1 });
HorizonSchema.index({ userId: 1, tags: 1 });
HorizonSchema.index({ isPublic: 1, createdAt: -1 });
HorizonSchema.index({ "sharedWith.userId": 1 });

HorizonSchema.index({ name: "text", description: "text", tags: "text" });

HorizonSchema.pre("save", function (next) {
  this.stats.nodeCount = this.nodes?.length || 0;
  // edgeCount will be calculated dynamically from nodes' parentId
  this.stats.edgeCount = 0; // Will be computed on read
  this.stats.agentCount = this.availableAgents?.length || 0;
  this.stats.portfolioCount = this.portfolios?.length || 0;

  if (!this.isNew) {
    this.version += 1;
  }

  next();
});

HorizonSchema.methods = {
  hasAccess(userId, requiredRole = "viewer") {
    if (this.userId.toString() === userId.toString()) {
      return true;
    }

    if (this.isPublic && requiredRole === "viewer") {
      return true;
    }

    const shared = this.sharedWith.find(
      (s) => s.userId.toString() === userId.toString()
    );

    if (!shared) return false;

    if (requiredRole === "viewer") return true;
    if (requiredRole === "editor") return shared.role === "editor";

    return false;
  },
};

HorizonSchema.statics = {
  buildEdgesFromNodes(nodes) {
    const edges = [];
    
    // Create a map for quick node lookup
    const nodeMap = new Map();
    nodes.forEach(node => {
      nodeMap.set(String(node._id), node);
    });
    
    nodes.forEach(node => {
      if (node.parentId) {
        if (node.type === 'outputNode') {
          const parentNode = nodeMap.get(String(node.parentId));
          
          if (parentNode && 
              parentNode.type === 'agentNode' && 
              parentNode.children && 
              parentNode.children.length > 0 &&
              String(parentNode.children[0]) === String(node._id)) {
            const edge = {
              id: `edge-${node.parentId}-${node.id}`,
              source: String(node.parentId),
              target: String(node._id),
              type: 'custom',
              animated: false,
              data: { output: node.data?.output || null },
            };
            edges.push(edge);
          } else {
            console.log(`[buildEdgesFromNodes] Skipping edge for outputNode ${node._id}: parent validation failed`);
          }
        } else {
          const edge = {
            id: `edge-${node.parentId}-${node.id}`,
            source: String(node.parentId),
            target: String(node._id),
            type: 'custom',
            animated: false,
            data: { output: node.data?.output || null },
          };
          edges.push(edge);
        }
      }
    });

    // Build edges from inputNodeIds (data agent → custom agent links)
    nodes.forEach(node => {
      if (node.inputNodeIds && node.inputNodeIds.length > 0) {
        node.inputNodeIds.forEach(inputId => {
          const inputIdStr = String(inputId);
          const targetIdStr = String(node._id);
          // Deduplicate: don't create if already exists from parentId
          const alreadyExists = edges.some(
            e => e.source === inputIdStr && e.target === targetIdStr
          );
          if (!alreadyExists && nodeMap.has(inputIdStr)) {
            edges.push({
              id: `edge-${inputIdStr}-${targetIdStr}`,
              source: inputIdStr,
              target: targetIdStr,
              type: 'custom',
              animated: false,
              data: { output: null },
            });
          }
        });
      }
    });

    return edges;
  },

  async findAccessible(userId, options = {}) {
    const { page = 1, limit = 20, search = "", tags = [] } = options;

    const query = {
      $or: [
        { userId },
        { "sharedWith.userId": userId },
        { isPublic: true },
      ],
      isActive: true,
    };

    if (search) {
      query.$text = { $search: search };
    }

    if (tags.length > 0) {
      query.tags = { $in: tags };
    }

    const [horizons, total] = await Promise.all([
      this.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.countDocuments(query),
    ]);

    return {
      horizons,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },
};

export const Horizon =
  mongoose.models.Horizon || mongoose.model("Horizon", HorizonSchema);
