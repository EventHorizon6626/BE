import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import request from "supertest";

// Two fake user IDs for ownership tests
const USER_A = new mongoose.Types.ObjectId();
const USER_B = new mongoose.Types.ObjectId();

// Current test user — can be switched per-test
let currentUserId = USER_A;

// Mock requireAuth before the router is imported
vi.mock("../src/middleware/requireAuth.js", () => ({
  requireAuth: (req, _res, next) => {
    req.auth = { userId: currentUserId.toString() };
    next();
  },
}));

// Now import models + router (requireAuth is already mocked)
const { Agent } = await import("../src/models/agent.js");
const { Horizon } = await import("../src/models/horizon.js");
const agentRoutes = (await import("../src/routes/agents.js")).default;

let mongod;
let app;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use("/api/agents", agentRoutes);
  return a;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  currentUserId = USER_A;
  await Agent.deleteMany({});
  await Horizon.deleteMany({});
});

// ---------------------------------------------------------------------------
// POST /api/agents — Create agent
// ---------------------------------------------------------------------------
describe("POST /api/agents", () => {
  it("creates an agent WITH horizonId (ownership verified)", async () => {
    const horizon = await Horizon.create({
      userId: USER_A,
      name: "Test Horizon",
      isActive: true,
    });

    const res = await request(app).post("/api/agents").send({
      name: "My Agent",
      description: "desc",
      horizonId: horizon._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("My Agent");
    expect(res.body.data.horizonId).toBe(horizon._id.toString());
  });

  it("creates an agent WITHOUT horizonId (global agent)", async () => {
    const res = await request(app).post("/api/agents").send({
      name: "Global Agent",
      description: "no horizon",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Global Agent");
    expect(res.body.data.horizonId).toBeUndefined();
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/api/agents").send({
      description: "no name",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/name/i);
  });

  it("returns 404 when horizonId belongs to another user", async () => {
    const horizon = await Horizon.create({
      userId: USER_B,
      name: "Other Horizon",
      isActive: true,
    });

    const res = await request(app).post("/api/agents").send({
      name: "Agent",
      horizonId: horizon._id.toString(),
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Horizon not found/i);
  });

  it("ignores invalid teamId gracefully", async () => {
    const res = await request(app).post("/api/agents").send({
      name: "Agent",
      teamId: "not-an-objectid",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.teamId).toBeUndefined();
  });

  it("accepts empty systemPrompt (defaults to empty string)", async () => {
    const res = await request(app).post("/api/agents").send({
      name: "Agent",
      systemPrompt: "",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.systemPrompt).toBe("");
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents — List user's agents
// ---------------------------------------------------------------------------
describe("GET /api/agents", () => {
  it("returns only active agents for the user", async () => {
    await Agent.create([
      { userId: USER_A, name: "Active", type: "custom_agent", isActive: true },
      { userId: USER_A, name: "Deleted", type: "custom_agent", isActive: false },
      { userId: USER_B, name: "Other User", type: "custom_agent", isActive: true },
    ]);

    const res = await request(app).get("/api/agents");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Active");
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id — Get single agent
// ---------------------------------------------------------------------------
describe("GET /api/agents/:id", () => {
  it("returns the agent when found and owned by user", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Mine",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).get(`/api/agents/${agent._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Mine");
  });

  it("returns 404 for inactive (soft-deleted) agent", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Deleted",
      type: "custom_agent",
      isActive: false,
    });

    const res = await request(app).get(`/api/agents/${agent._id}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for agent owned by another user (non-public)", async () => {
    const agent = await Agent.create({
      userId: USER_B,
      name: "Private",
      type: "custom_agent",
      isActive: true,
      isPublic: false,
    });

    const res = await request(app).get(`/api/agents/${agent._id}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access denied/i);
  });

  it("returns 200 for public agent owned by another user", async () => {
    const agent = await Agent.create({
      userId: USER_B,
      name: "Public",
      type: "custom_agent",
      isActive: true,
      isPublic: true,
    });

    const res = await request(app).get(`/api/agents/${agent._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Public");
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/:id — Update agent
// ---------------------------------------------------------------------------
describe("PUT /api/agents/:id", () => {
  it("updates agent fields", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Old Name",
      type: "custom_agent",
      model: "gpt-4",
      icon: "MdSmartToy",
      color: "blue",
      isActive: true,
    });

    const res = await request(app).put(`/api/agents/${agent._id}`).send({
      name: "New Name",
      model: "gpt-4-turbo",
      icon: "MdRocket",
      color: "red",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("New Name");
    expect(res.body.data.model).toBe("gpt-4-turbo");
    expect(res.body.data.icon).toBe("MdRocket");
    expect(res.body.data.color).toBe("red");
  });

  it("returns 404 for inactive agent", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Deleted",
      type: "custom_agent",
      isActive: false,
    });

    const res = await request(app).put(`/api/agents/${agent._id}`).send({
      name: "Updated",
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for agent owned by another user", async () => {
    const agent = await Agent.create({
      userId: USER_B,
      name: "Not Mine",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).put(`/api/agents/${agent._id}`).send({
      name: "Hacked",
    });

    expect(res.status).toBe(404);
  });

  it("updates teamId", async () => {
    const teamId = new mongoose.Types.ObjectId();
    const agent = await Agent.create({
      userId: USER_A,
      name: "Agent",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).put(`/api/agents/${agent._id}`).send({
      teamId: teamId.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.teamId).toBe(teamId.toString());
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id — Soft delete
// ---------------------------------------------------------------------------
describe("DELETE /api/agents/:id", () => {
  it("sets isActive to false (soft delete)", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "To Delete",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).delete(`/api/agents/${agent._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const found = await Agent.findById(agent._id);
    expect(found.isActive).toBe(false);
  });

  it("returns 404 for already-deleted agent", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Already Gone",
      type: "custom_agent",
      isActive: false,
    });

    const res = await request(app).delete(`/api/agents/${agent._id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for agent owned by another user", async () => {
    const agent = await Agent.create({
      userId: USER_B,
      name: "Not Mine",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).delete(`/api/agents/${agent._id}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/restore — Restore soft-deleted agent
// ---------------------------------------------------------------------------
describe("POST /api/agents/:id/restore", () => {
  it("restores isActive to true", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Restore Me",
      type: "custom_agent",
      isActive: false,
    });

    const res = await request(app).post(`/api/agents/${agent._id}/restore`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Restore Me");

    const found = await Agent.findById(agent._id);
    expect(found.isActive).toBe(true);
  });

  it("returns 404 for active (non-deleted) agent", async () => {
    const agent = await Agent.create({
      userId: USER_A,
      name: "Already Active",
      type: "custom_agent",
      isActive: true,
    });

    const res = await request(app).post(`/api/agents/${agent._id}/restore`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for agent owned by another user", async () => {
    const agent = await Agent.create({
      userId: USER_B,
      name: "Not Mine",
      type: "custom_agent",
      isActive: false,
    });

    const res = await request(app).post(`/api/agents/${agent._id}/restore`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/horizon/:horizonId — Agents by horizon
// ---------------------------------------------------------------------------
describe("GET /api/agents/horizon/:horizonId", () => {
  it("returns agents for an owned horizon", async () => {
    const horizon = await Horizon.create({
      userId: USER_A,
      name: "My Horizon",
      isActive: true,
    });

    await Agent.create([
      { userId: USER_A, horizonId: horizon._id, name: "A1", type: "custom_agent", isActive: true },
      { userId: USER_A, horizonId: horizon._id, name: "A2", type: "custom_agent", isActive: true },
      { userId: USER_A, horizonId: horizon._id, name: "Deleted", type: "custom_agent", isActive: false },
    ]);

    const res = await request(app).get(`/api/agents/horizon/${horizon._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  it("returns 404 for horizon owned by another user", async () => {
    const horizon = await Horizon.create({
      userId: USER_B,
      name: "Other Horizon",
      isActive: true,
    });

    const res = await request(app).get(`/api/agents/horizon/${horizon._id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for inactive horizon", async () => {
    const horizon = await Horizon.create({
      userId: USER_A,
      name: "Inactive Horizon",
      isActive: false,
    });

    const res = await request(app).get(`/api/agents/horizon/${horizon._id}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/team/:teamId — Agents by team
// ---------------------------------------------------------------------------
describe("GET /api/agents/team/:teamId", () => {
  it("returns active agents for the team", async () => {
    const teamId = new mongoose.Types.ObjectId();

    await Agent.create([
      { userId: USER_A, teamId, name: "T1", type: "custom_agent", isActive: true },
      { userId: USER_A, teamId, name: "T2", type: "custom_agent", isActive: true },
      { userId: USER_A, teamId, name: "Deleted", type: "custom_agent", isActive: false },
    ]);

    const res = await request(app).get(`/api/agents/team/${teamId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/generate-agent-system-prompt — Generate system prompt
// ---------------------------------------------------------------------------
describe("POST /api/agents/generate-agent-system-prompt", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/api/agents/generate-agent-system-prompt").send({
      description: "some description",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*required/i);
  });

  it("allows missing description (description is optional)", async () => {
    const res = await request(app).post("/api/agents/generate-agent-system-prompt").send({
      name: "some name",
    });

    // Should not return 400 for missing description since it's optional
    // This will likely fail due to AI service not being available in tests,
    // but that's a different error (500 or network error), not 400
    expect(res.status).not.toBe(400);
  });
});
