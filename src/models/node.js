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

    nodeId: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["agentNode", "portfolioNode", "teamNode", "customNode"],
      default: "agentNode",
    },

    parentId: {
      type: String,
      default: null,
      index: true,
    },

    children: [
      {
        type: String,
      },
    ],

    depth: {
      type: Number,
      default: 0,
    },

    path: {
      type: String,
      default: "",
    },

    position: {
      x: { type: Number, required: true, default: 0 },
      y: { type: Number, required: true, default: 0 },
    },

    data: {
      agent: {
        id: String,
        name: String,
        type: String,
        system: String,
        teamId: String,
        icon: String,
        color: String,
        isBuiltin: Boolean,
        description: String,
        model: String,
      },

      portfolio: {
        id: String,
        name: String,
        stocks: [String],
        createdAt: Date,
      },

      team: {
        id: String,
        name: String,
        description: String,
        agents: [mongoose.Schema.Types.Mixed],
      },

      config: {
        name: String,
        description: String,
        model: String,
        temperature: { type: Number, default: 0.7 },
        maxTokens: { type: Number, default: 2000 },
      },

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
NodeSchema.index({ horizonId: 1, nodeId: 1 }, { unique: true });
NodeSchema.index({ horizonId: 1, parentId: 1 });
NodeSchema.index({ horizonId: 1, path: 1 });

NodeSchema.pre("save", async function (next) {
  if (this.isModified("parentId")) {
    if (this.parentId) {
      const parent = await this.constructor.findOne({
        horizonId: this.horizonId,
        nodeId: this.parentId,
      });
      if (parent) {
        this.depth = parent.depth + 1;
        this.path = parent.path ? `${parent.path}/${this.nodeId}` : this.nodeId;
      }
    } else {
      this.depth = 0;
      this.path = this.nodeId;
    }
  }

  next();
});

NodeSchema.statics = {
  async getTree(horizonId) {
    const nodes = await this.find({ horizonId, isActive: true }).sort({
      depth: 1,
      executionOrder: 1,
    });

    const nodeMap = {};
    const roots = [];

    nodes.forEach((node) => {
      nodeMap[node.nodeId] = {
        ...node.toJSON(),
        children: [],
      };
    });

    nodes.forEach((node) => {
      if (node.parentId && nodeMap[node.parentId]) {
        nodeMap[node.parentId].children.push(nodeMap[node.nodeId]);
      } else {
        roots.push(nodeMap[node.nodeId]);
      }
    });

    return roots;
  },
};

export const Node =
  mongoose.models.Node || mongoose.model("Node", NodeSchema);
