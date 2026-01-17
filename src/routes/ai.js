// src/routes/ai.js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const aiRouter = express.Router();

// AI Service URL (runs on same VPS, localhost)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5000";

/**
 * Proxy endpoint for portfolio analysis
 * Forwards requests to the AI service running on localhost:5000
 */
aiRouter.post("/portfolio/analyze", requireAuth, async (req, res) => {
  try {
    const { stocks } = req.body;

    // Validate request
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    console.log(`[AI Proxy] Analyzing portfolio with ${stocks.length} stocks:`, stocks);

    // Forward request to AI service
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/portfolio/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ stocks }),
      // 60 second timeout for AI processing
      signal: AbortSignal.timeout(60000),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[AI Proxy] AI service error ${aiResponse.status}:`, errorText);

      return res.status(aiResponse.status).json({
        error: "AI service error",
        message: errorText || "Failed to analyze portfolio",
        status: aiResponse.status,
      });
    }

    const data = await aiResponse.json();
    console.log(`[AI Proxy] Portfolio analysis complete`);

    return res.json(data);
  } catch (error) {
    console.error("[AI Proxy] Error:", error);

    // Handle timeout
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "AI service took too long to respond. Please try again.",
      });
    }

    // Handle connection errors
    if (error.cause?.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Service unavailable",
        message: "AI service is not responding. Please try again later.",
      });
    }

    // Generic error
    return res.status(500).json({
      error: "Internal server error",
      message: error.message || "Failed to process portfolio analysis",
    });
  }
});

// Health check for AI service
aiRouter.get("/health", async (req, res) => {
  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!aiResponse.ok) {
      return res.status(503).json({
        ok: false,
        message: "AI service is unhealthy",
        status: aiResponse.status,
      });
    }

    const data = await aiResponse.json();
    return res.json({
      ok: true,
      aiService: data,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      message: "AI service is unavailable",
      error: error.message,
    });
  }
});
