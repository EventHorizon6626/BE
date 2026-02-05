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

/**
 * Individual Agent Proxy Endpoints
 * Forward requests to specific agents for pipeline builder
 */

// Generic agent proxy handler
async function proxyAgentRequest(agentName, req, res) {
  try {
    const { stocks, timeframe, period, days, indicators, data } = req.body;

    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    console.log(`[AI Proxy] Running ${agentName} agent for ${stocks.length} stocks`);

    const aiResponse = await fetch(`${AI_SERVICE_URL}/agents/${agentName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        stocks,
        timeframe: timeframe || "1d",
        period: period || "30d",
        days: days || 7,
        indicators: indicators || ["SMA", "RSI", "MACD"],
        data: data || null, // For System 2 agents
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[AI Proxy] ${agentName} agent error ${aiResponse.status}:`, errorText);

      return res.status(aiResponse.status).json({
        error: "AI service error",
        message: errorText || `Failed to run ${agentName} agent`,
        status: aiResponse.status,
      });
    }

    const data = await aiResponse.json();
    console.log(`[AI Proxy] ${agentName} agent completed successfully`);

    return res.json(data);
  } catch (error) {
    console.error(`[AI Proxy] ${agentName} error:`, error);

    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timeout",
        message: `${agentName} agent took too long to respond`,
      });
    }

    if (error.cause?.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Service unavailable",
        message: "AI service is not responding",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: error.message || `Failed to run ${agentName} agent`,
    });
  }
}

// Candlestick Agent
aiRouter.post("/agents/candlestick", requireAuth, (req, res) =>
  proxyAgentRequest("candlestick", req, res)
);

// Earnings Agent
aiRouter.post("/agents/earnings", requireAuth, (req, res) =>
  proxyAgentRequest("earnings", req, res)
);

// News Agent
aiRouter.post("/agents/news", requireAuth, (req, res) =>
  proxyAgentRequest("news", req, res)
);

// Technical Analysis Agent
aiRouter.post("/agents/technical", requireAuth, (req, res) =>
  proxyAgentRequest("technical", req, res)
);

// Fundamentals Agent
aiRouter.post("/agents/fundamentals", requireAuth, (req, res) =>
  proxyAgentRequest("fundamentals", req, res)
);

// ===== System 2: Team 1 Analyst Agents =====

aiRouter.post("/agents/fundamentals-analyst", requireAuth, (req, res) =>
  proxyAgentRequest("fundamentals-analyst", req, res)
);

aiRouter.post("/agents/sentiment-analyst", requireAuth, (req, res) =>
  proxyAgentRequest("sentiment-analyst", req, res)
);

aiRouter.post("/agents/news-analyst", requireAuth, (req, res) =>
  proxyAgentRequest("news-analyst", req, res)
);

aiRouter.post("/agents/technical-analyst", requireAuth, (req, res) =>
  proxyAgentRequest("technical-analyst", req, res)
);

// ===== System 2: Team 2 Researcher Agents =====

aiRouter.post("/agents/bull-researcher", requireAuth, (req, res) =>
  proxyAgentRequest("bull-researcher", req, res)
);

aiRouter.post("/agents/bear-researcher", requireAuth, (req, res) =>
  proxyAgentRequest("bear-researcher", req, res)
);

aiRouter.post("/agents/research-manager", requireAuth, (req, res) =>
  proxyAgentRequest("research-manager", req, res)
);

// ===== System 2: Team 3 Portfolio =====

aiRouter.post("/agents/portfolio-manager", requireAuth, (req, res) =>
  proxyAgentRequest("portfolio-manager", req, res)
);

// ===== System 2: Team 4 Risk & Execution =====

aiRouter.post("/agents/risk-manager", requireAuth, (req, res) =>
  proxyAgentRequest("risk-manager", req, res)
);

aiRouter.post("/agents/trader", requireAuth, (req, res) =>
  proxyAgentRequest("trader", req, res)
);

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
