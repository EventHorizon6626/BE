// src/routes/jobs.js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Job } from "../models/job.js";

export const jobsRouter = express.Router();

/**
 * GET /api/jobs/by-node/:agentNodeId
 * Get active job for a specific agent node
 */
jobsRouter.get("/by-node/:agentNodeId", requireAuth, async (req, res) => {
  try {
    const { agentNodeId } = req.params;
    const userId = req.auth.userId;

    // Find the most recent active job for this node
    const job = await Job.findOne({
      userId,
      agentNodeId,
      status: { $in: ["pending", "processing"] }
    })
      .sort({ createdAt: -1 })
      .limit(1);

    // Return null if no active job found (not 404)
    if (!job) {
      return res.json({ job: null });
    }

    // Return job data
    return res.json({
      job: {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        agentType: job.agentType,
        agentNodeId: job.agentNodeId,
        horizonId: job.horizonId,
        result: job.result,
        error: job.error,
        metadata: job.metadata,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }
    });
  } catch (error) {
    console.error("[Jobs API] Error fetching job by node:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job status and result
 */
jobsRouter.get("/:jobId", requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.auth.userId;

    const job = await Job.findOne({ _id: jobId, userId });

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
        message: "Job does not exist or you don't have access to it",
      });
    }

    // Return job data
    return res.json({
      jobId: job._id,
      status: job.status,
      progress: job.progress,
      agentType: job.agentType,
      result: job.result,
      error: job.error,
      metadata: job.metadata,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    console.error("[Jobs API] Error fetching job:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/jobs
 * List all jobs for current user (with pagination)
 */
jobsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { status, agentType, limit = 50, skip = 0 } = req.query;

    const query = { userId };
    if (status) query.status = status;
    if (agentType) query.agentType = agentType;

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select("-requestData -result.raw_data"); // Exclude heavy data

    const total = await Job.countDocuments(query);

    return res.json({
      jobs: jobs.map(job => ({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        agentType: job.agentType,
        error: job.error,
        metadata: job.metadata,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (error) {
    console.error("[Jobs API] Error listing jobs:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/jobs/:jobId
 * Cancel/delete a job
 */
jobsRouter.delete("/:jobId", requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.auth.userId;

    const job = await Job.findOne({ _id: jobId, userId });

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
        message: "Job does not exist or you don't have access to it",
      });
    }

    // Only allow deletion of pending or failed jobs
    if (job.status === "processing") {
      return res.status(400).json({
        error: "Cannot delete processing job",
        message: "Job is currently being processed",
      });
    }

    await Job.deleteOne({ _id: jobId });

    return res.json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error("[Jobs API] Error deleting job:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});
