// src/routes/ai.js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const aiRouter = express.Router();

// AI Service URL (Event-Horizon-AI runs on port 8001)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

/**
 * Proxy endpoint for portfolio analysis
 * Forwards requests to Event-Horizon-AI service (Stage 1 data pipeline)
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

    // Forward request to Event-Horizon-AI service
    // Note: AI expects "portfolio" key, not "stocks"
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/v1/analyze-portfolio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        portfolio: stocks,
        portfolio_id: `portfolio_${Date.now()}`
      }),
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

    // Wrap in 'result' object for FE compatibility
    return res.json({
      result: data.stage1_output
    });
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

/**
 * Proxy endpoint for stock chart data
 * Requests only candlestick data from Event-Horizon-AI
 */
aiRouter.post("/chart", requireAuth, async (req, res) => {
  try {
    const { stocks } = req.body;

    // Validate request
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    console.log(`[AI Proxy] Fetching chart data for ${stocks.length} stocks:`, stocks);

    // Request only candlestick agent for faster response
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/v1/analyze-portfolio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        portfolio: stocks,
        enabled_agents: ["candlestick"],
        portfolio_id: `chart_${Date.now()}`
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[AI Proxy] Chart data error ${aiResponse.status}:`, errorText);

      return res.status(aiResponse.status).json({
        error: "AI service error",
        message: errorText || "Failed to fetch chart data",
        status: aiResponse.status,
      });
    }

    const data = await aiResponse.json();
    console.log(`[AI Proxy] Chart data fetched successfully`);

    // Wrap in 'result' object for FE compatibility
    return res.json({
      result: {
        chart_data: data?.stage1_output?.chart_data || {}
      }
    });
  } catch (error) {
    console.error("[AI Proxy] Chart error:", error);

    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "Chart data request took too long. Please try again.",
      });
    }

    if (error.cause?.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Service unavailable",
        message: "AI service is not responding. Please try again later.",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: error.message || "Failed to fetch chart data",
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
