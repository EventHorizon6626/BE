// src/routes/ai.js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { Node } from "../models/node.js";

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

/**
 * Normalize agent responses to a consistent format
 * Transforms agent-specific response structures into common format
 * while preserving original data for debugging
 */
function normalizeAgentResponse(agentName, rawResponse) {
  const normalized = {
    ...rawResponse,
    agent_type: agentName,
  };

  // Detect and normalize data_by_symbol field
  let dataBySymbol = null;
  let dataFieldName = null;

  const fieldMappings = {
    chart_data_by_symbol: 'chart_data_by_symbol',
    earnings_data_by_symbol: 'earnings_data_by_symbol',
    news_data_by_symbol: 'news_data_by_symbol',
    technical_data_by_symbol: 'technical_data_by_symbol',
    fundamentals_data_by_symbol: 'fundamentals_data_by_symbol',
  };

  for (const [fieldName, mappedName] of Object.entries(fieldMappings)) {
    if (rawResponse[fieldName]) {
      dataBySymbol = rawResponse[fieldName];
      dataFieldName = fieldName;
      break;
    }
  }

  if (dataBySymbol) {
    normalized.data_by_symbol = dataBySymbol;
    normalized.original_field_name = dataFieldName;
    normalized.raw_data = { ...rawResponse };

    console.log(`[Normalizer] ${agentName}: Normalized ${dataFieldName} -> data_by_symbol (${Object.keys(dataBySymbol).length} symbols)`);
  } else {
    console.warn(`[Normalizer] ${agentName}: No recognized data_by_symbol field found`);
  }

  return normalized;
}

// Generic agent proxy handler
async function proxyAgentRequest(agentName, req, res) {
  try {
    const {
      stocks,
      timeframe,
      period,
      days,
      indicators,
      data,
      // Thinking agent parameters
      input_data,
      system_prompt,
      max_iterations,
      available_tools,
    } = req.body;

    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    console.log(`[AI Proxy] Running ${agentName} agent for ${stocks.length} stocks`);

    const requestBody = {
      stocks,
      timeframe: timeframe || "1d",
      period: period || "30d",
      days: days || 7,
      indicators: indicators || ["SMA", "RSI", "MACD"],
      data: data || null, // For System 2 agents
      // Thinking agent parameters (used by bull-bear-analyzer and thinking agents)
      input_data: input_data || data || null,
      system_prompt: system_prompt || null,
      max_iterations: max_iterations || 5,
      available_tools: available_tools || ["candlestick", "earnings", "news", "technical", "fundamentals"],
    };

    // Route to configured provider
    const Aidata = await routeDataAgentRequest(agentName, requestBody);
    const normalizedData = normalizeAgentResponse(agentName, Aidata);
    console.log(`[AI Proxy] ${agentName} agent completed (provider: ${Aidata._provider || 'unknown'})`);
    console.log(`[AI Proxy] Response structure:`, Object.keys(normalizedData));

    // Skip saving outputNode if agent needs data (FE will handle the flow)
    if (Aidata.status === 'needs_data') {
      console.log(`[AI Proxy] ${agentName} agent needs data, skipping outputNode save`);
      return res.json(normalizedData);
    }

    // Auto-save outputNode to DB
    try {
      const { horizonId, agentNodeId, agentPosition } = req.body;
      console.log(`[AI Proxy] Attempting to save outputNode for agentNodeId: ${agentNodeId}, horizonId: ${horizonId}`);

      if (horizonId && agentNodeId) {
        const outputNode = new Node({
          userId: req.auth.userId,
          parentId: agentNodeId,
          horizonId,
          type: "outputNode",
          position: agentPosition ? {
            x: agentPosition.x + 350,
            y: agentPosition.y
          } : { x: 0, y: 0 },
          data: {
            result: normalizedData,
            agentName: agentName,
            timestamp: new Date().toISOString(),
            metadata: {
              agentType: agentName,
              symbols: stocks,
              period: period || "30d",
              timeframe: timeframe || "1d",
              provider: Aidata._provider || 'unknown',
            },
          },
        });

        const outputNodeDoc = await outputNode.save();

        const alloutputNodesOfCurrentAgent = await Node.find({
          horizonId,
          parentId: agentNodeId,
          type: "outputNode",
          isActive: true,
        });
        const oldOutputNodes = alloutputNodesOfCurrentAgent.filter(node => node._id.toString() !== outputNodeDoc._id.toString());
        if (oldOutputNodes.length > 0) {
          const oldOutputNodeIds = oldOutputNodes.map(node => node._id);
          await Node.updateMany(
            { _id: { $in: oldOutputNodeIds } },
            { $set: { isActive: false } }
          );
          console.log(`[AI Proxy] Marked ${oldOutputNodeIds.length} old outputNodes as inactive for agentNodeId: ${agentNodeId}`);
        }
        const agentNode = await Node.findById({ _id: agentNodeId});
        agentNode.children = [String(outputNodeDoc._id)];
        await agentNode.save();

        console.log(`[AI Proxy] Saved outputNode: ${outputNodeDoc._id}`);

        // Return result + saved outputNode info
        return res.json({
          ...normalizedData,
          _outputNode: {
            id: String(outputNodeDoc._id),
            createdAt: outputNodeDoc.createdAt,
          },
        });
      }
    } catch (saveError) {
      console.error(`[AI Proxy] Failed to save outputNode:`, saveError);
      // Continue even if save fails - don't block agent response
    }

    return res.json(normalizedData);
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

/**
 * Route data agent requests to appropriate provider
 * Uses AGENT_PROVIDER to control routing for ALL agents
 * @param {string} agentName - Agent type (candlestick, earnings, news, technical, fundamentals)
 * @param {object} requestBody - Request payload
 * @returns {Promise<object>} - Agent response with provider metadata
 */
async function routeDataAgentRequest(agentName, requestBody) {
  const provider = process.env.AGENT_PROVIDER || "event-horizon-ai";

  console.log(`[Agent Router] Routing ${agentName} to provider: ${provider}`);

  if (provider === "eh-multi-agent") {
    return await callEHMultiAgentDataEndpoint(agentName, requestBody);
  } else if (provider === "event-horizon-ai") {
    return await callEventHorizonAIEndpoint(agentName, requestBody);
  } else if (provider === "google") {
    // Google doesn't support data agents, fallback to Event-Horizon-AI
    console.warn(`[Agent Router] Provider "${provider}" doesn't support data agents, using event-horizon-ai as fallback`);
    return await callEventHorizonAIEndpoint(agentName, requestBody);
  } else {
    throw new Error(`Unknown AGENT_PROVIDER: ${provider}. Must be "event-horizon-ai", "eh-multi-agent", or "google"`);
  }
}

/**
 * Call EH Multi-Agent data retrieval endpoint
 * @param {string} agentName - Agent type (candlestick, earnings, news, etc.)
 * @param {object} requestBody - Request payload
 * @returns {Promise<object>} - Data response
 */
async function callEHMultiAgentDataEndpoint(agentName, requestBody) {
  const EH_MULTI_AGENT_BASE_URL = process.env.EH_MULTI_AGENT_URL || "http://20.74.82.247:8030";
  const endpoint = `${EH_MULTI_AGENT_BASE_URL}/agents/${agentName}`;

  console.log(`[EH-Multi-Agent] Calling ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60000), // 60 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EH-Multi-Agent] Error ${response.status}:`, errorText);
    throw new Error(`EH Multi-Agent ${agentName} error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`[EH-Multi-Agent] ${agentName} call successful`);

  // Add provider metadata
  return {
    ...data,
    _provider: "eh-multi-agent",
  };
}

/**
 * Call Event-Horizon-AI endpoint (existing default behavior)
 * @param {string} agentName - Agent type
 * @param {object} requestBody - Request payload
 * @returns {Promise<object>} - Data response
 */
async function callEventHorizonAIEndpoint(agentName, requestBody) {
  const response = await fetch(`${AI_SERVICE_URL}/agents/${agentName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Event-Horizon-AI] Error ${response.status}:`, errorText);
    throw new Error(`Event-Horizon-AI ${agentName} error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Add provider metadata
  return {
    ...data,
    _provider: "event-horizon-ai",
  };
}

/**
 * Call Google Gemini API for custom agent analysis
 * @param {Array} stocks - Array of stock symbols
 * @param {string} systemPrompt - System prompt for agent behavior
 * @param {string} userPrompt - Optional user prompt
 * @param {object} earningsData - Optional earnings data from prior agents
 * @returns {Promise<object>} - Normalized response
 */
async function analyzeWithGoogle(stocks, systemPrompt, userPrompt, earningsData = null) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "your_google_api_key_here") {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  console.log("[Google Provider] Calling Google Gemini API with model:", GEMINI_MODEL);

  // Construct prompt for Gemini
  let userMessage = userPrompt || `Analyze the following stocks: ${stocks.join(", ")}`;

  // If earnings data exists, append it to the user message
  if (earningsData && Array.isArray(earningsData) && earningsData.length > 0) {
    userMessage += `\n\nEarnings Data:\n${JSON.stringify(earningsData, null, 2)}`;
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: userMessage
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: systemPrompt
        }
      ]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    }
  };

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000), // 45 second timeout for Gemini
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`[Google Provider] API error ${geminiResponse.status}:`, errorText);
    throw new Error(`Google API error: ${geminiResponse.status} - ${errorText}`);
  }

  const geminiData = await geminiResponse.json();
  console.log("[Google Provider] Google API call successful");

  // Normalize Gemini response to match AI service format
  const analysisText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return {
    status: "success",
    analysis: analysisText,
    model: GEMINI_MODEL,
    provider: "google",
    usage: geminiData.usageMetadata || null,
  };
}

/**
 * Call EH Multi-Agent custom agent endpoint (POST /agents/custom)
 * Uses the thinking loop with create_data_agent / needs_data support.
 *
 * @param {Array} stocks - Array of stock symbols
 * @param {string} systemPrompt - System prompt for agent behavior
 * @param {string} userPrompt - Optional user prompt
 * @param {object} inputData - Optional input data from prior agents
 * @param {string} executionMode - Optional execution mode (e.g. 'fetch_data')
 * @returns {Promise<object>} - Response from EH multi-agent endpoint
 */
async function analyzeWithEHMultiAgent(stocks, systemPrompt, userPrompt, inputData = null, executionMode = null) {
  const EH_MULTI_AGENT_BASE_URL = process.env.EH_MULTI_AGENT_URL || "http://20.74.82.247:8030";
  const customEndpoint = `${EH_MULTI_AGENT_BASE_URL}/agents/custom`;

  console.log("[EH-Multi-Agent] Calling custom agent endpoint:", customEndpoint);

  // Construct request body matching EH CustomAgentRequest model
  const requestBody = {
    stocks,
    system_prompt: systemPrompt,
    user_prompt: userPrompt || null,
    input_data: inputData || null,
  };
  if (executionMode) {
    requestBody.execution_mode = executionMode;
  }

  const response = await fetch(customEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(180000), // 180 second timeout (thinking loop needs time)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EH-Multi-Agent] Custom agent error ${response.status}:`, errorText);
    throw new Error(`EH Multi-Agent custom agent error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[EH-Multi-Agent] Custom agent call successful, status:", data.status || "success");

  // Add metadata to response
  return {
    ...data,
    provider: "eh-multi-agent",
  };
}

/**
 * Create/register an agent in EH Multi-Agent system (POST /agents)
 * @param {string} agentName - Name of the agent
 * @param {string} systemPrompt - System prompt for agent behavior
 * @param {object} config - Optional agent configuration
 * @returns {Promise<object>} - Agent registration response with agent ID
 */
async function createEHMultiAgent(agentName, systemPrompt, config = {}) {
  const EH_MULTI_AGENT_BASE_URL = process.env.EH_MULTI_AGENT_URL || "http://20.74.82.247:8030";
  const createEndpoint = `${EH_MULTI_AGENT_BASE_URL}/agents`;

  console.log("[EH-Multi-Agent] Creating agent:", agentName);

  const requestBody = {
    name: agentName,
    system_prompt: systemPrompt,
    ...config,
  };

  const response = await fetch(createEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EH-Multi-Agent] Create agent error ${response.status}:`, errorText);
    throw new Error(`Failed to create EH Multi-Agent: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[EH-Multi-Agent] Agent created successfully:", data.agent_id || data.id);

  return data;
}

/**
 * Retrieve agent data from EH Multi-Agent system (GET /agents/{id})
 * @param {string} agentId - Agent ID to retrieve
 * @returns {Promise<object>} - Agent data
 */
async function retrieveEHMultiAgentData(agentId) {
  const EH_MULTI_AGENT_BASE_URL = process.env.EH_MULTI_AGENT_URL || "http://20.74.82.247:8030";
  const retrieveEndpoint = `${EH_MULTI_AGENT_BASE_URL}/agents/${agentId}`;

  console.log("[EH-Multi-Agent] Retrieving agent data:", agentId);

  const response = await fetch(retrieveEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[EH-Multi-Agent] Retrieve agent error ${response.status}:`, errorText);
    throw new Error(`Failed to retrieve EH Multi-Agent data: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[EH-Multi-Agent] Agent data retrieved successfully");

  return data;
}

// Custom Agent (user-provided system prompt) with provider switching
aiRouter.post("/agents/custom", requireAuth, async (req, res) => {
  try {
    const {
      stocks,
      system_prompt,
      user_prompt,
      horizonId,
      agentNodeId,
      agentPosition,
      period,
      timeframe,
      agentName,
      input_data, // Optional earnings data from prior agents
      execution_mode, // Optional execution mode (e.g. 'fetch_data' for DATA agents)
    } = req.body;

    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    if (!system_prompt) {
      return res.status(400).json({
        error: "Invalid request",
        message: "system_prompt is required for custom agents",
      });
    }

    // Get configured provider from environment
    const provider = process.env.AGENT_PROVIDER || "eh-multi-agent";
    console.log(`[AI Proxy] Running custom agent with provider: ${provider}`);

    let data = null;

    // Route to appropriate provider
    try {
      if (provider === "google") {
        data = await analyzeWithGoogle(stocks, system_prompt, user_prompt, input_data);
      } else if (provider === "eh-multi-agent") {
        data = await analyzeWithEHMultiAgent(stocks, system_prompt, user_prompt, input_data, execution_mode);
      } else {
        throw new Error(`Unknown AGENT_PROVIDER: ${provider}. Must be "google" or "eh-multi-agent"`);
      }
    } catch (error) {
      console.error(`[AI Proxy] ${provider} provider failed:`, error.message);
      return res.status(503).json({
        error: "Provider unavailable",
        message: `${provider} provider failed: ${error.message}`,
        provider: provider,
      });
    }

    // Normalize response if needed
    // Note: This handles both "needs_data" and "success" status responses
    const normalizedData = normalizeAgentResponse("custom", data);

    console.log(`[AI Proxy] Custom agent completed (provider: ${provider}, status: ${data.status || 'success'})`);

    // Skip saving outputNode if agent needs data (FE will handle the flow)
    if (data.status === 'needs_data') {
      console.log(`[AI Proxy] Custom agent needs data, skipping outputNode save`);
      return res.json(normalizedData);
    }

    // Auto-save outputNode to DB
    try {
      console.log(`[AI Proxy] Attempting to save outputNode for agentNodeId: ${agentNodeId}, horizonId: ${horizonId}`);

      if (horizonId && agentNodeId) {
        const outputNode = new Node({
          userId: req.auth.userId,
          parentId: agentNodeId,
          horizonId,
          type: "outputNode",
          position: agentPosition ? {
            x: agentPosition.x + 350,
            y: agentPosition.y
          } : { x: 0, y: 0 },
          data: {
            result: normalizedData,
            agentName: agentName || "Custom Agent",
            timestamp: new Date().toISOString(),
            metadata: {
              agentType: "custom",
              symbols: stocks,
              period: period || "30d",
              timeframe: timeframe || "1d",
              provider: data.provider,
            },
          },
        });

        const outputNodeDoc = await outputNode.save();

        const alloutputNodesOfCurrentAgent = await Node.find({
          horizonId,
          parentId: agentNodeId,
          type: "outputNode",
          isActive: true,
        });
        const oldOutputNodes = alloutputNodesOfCurrentAgent.filter(node => node._id.toString() !== outputNodeDoc._id.toString());
        if (oldOutputNodes.length > 0) {
          const oldOutputNodeIds = oldOutputNodes.map(node => node._id);
          await Node.updateMany(
            { _id: { $in: oldOutputNodeIds } },
            { $set: { isActive: false } }
          );
          console.log(`[AI Proxy] Marked ${oldOutputNodeIds.length} old outputNodes as inactive for agentNodeId: ${agentNodeId}`);
        }
        const agentNode = await Node.findById({ _id: agentNodeId });
        agentNode.children = [String(outputNodeDoc._id)];
        await agentNode.save();

        console.log(`[AI Proxy] Saved outputNode: ${outputNodeDoc._id}`);

        // Return result + saved outputNode info
        return res.json({
          ...normalizedData,
          _outputNode: {
            id: String(outputNodeDoc._id),
            createdAt: outputNodeDoc.createdAt,
          },
        });
      }
    } catch (saveError) {
      console.error(`[AI Proxy] Failed to save outputNode:`, saveError);
      // Continue even if save fails - don't block agent response
    }

    return res.json(normalizedData);
  } catch (error) {
    console.error(`[AI Proxy] Custom agent error:`, error);

    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "Custom agent took too long to respond",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: error.message || "Failed to run custom agent",
    });
  }
});

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

// Bull-Bear Analyzer - Standalone thinking agent for bull/bear debate
aiRouter.post("/agents/bull-bear-analyzer", requireAuth, (req, res) =>
  proxyAgentRequest("bull-bear-analyzer", req, res)
);

// Bull-Bear Analyzer (backward compatibility with underscore naming)
aiRouter.post("/agents/bull_bear_analyzer", requireAuth, (req, res) =>
  proxyAgentRequest("bull-bear-analyzer", req, res)
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

// ===== Thinking Agent Endpoint =====

/**
 * Proxy thinking agent requests to Event-Horizon-AI
 * Supports iterative ReAct-style reasoning with tool calling
 */
aiRouter.post("/agents/think", requireAuth, async (req, res) => {
  try {
    const { stocks, input_data, system_prompt, max_iterations, available_tools } = req.body;

    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "stocks array is required and must not be empty",
      });
    }

    if (!system_prompt) {
      return res.status(400).json({
        error: "Invalid request",
        message: "system_prompt is required",
      });
    }

    console.log(`[AI Proxy] Running thinking agent for ${stocks.length} stocks with max ${max_iterations || 5} iterations`);

    const aiResponse = await fetch(`${AI_SERVICE_URL}/agents/think`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        stocks,
        input_data: input_data || null,
        system_prompt,
        max_iterations: max_iterations || 5,
        available_tools: available_tools || ["candlestick", "earnings", "news", "technical", "fundamentals"],
      }),
      // Longer timeout for thinking agents (up to 3 minutes)
      signal: AbortSignal.timeout(180000),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[AI Proxy] Thinking agent error ${aiResponse.status}:`, errorText);

      return res.status(aiResponse.status).json({
        error: "AI service error",
        message: errorText || "Failed to run thinking agent",
        status: aiResponse.status,
      });
    }

    const responseData = await aiResponse.json();
    console.log(`[AI Proxy] Thinking agent completed with status: ${responseData.status}, iterations: ${responseData.iterations_used}`);

    return res.json(responseData);
  } catch (error) {
    console.error("[AI Proxy] Thinking agent error:", error);

    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return res.status(504).json({
        error: "Request timeout",
        message: "Thinking agent took too long to respond. Try reducing max iterations.",
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
      message: error.message || "Failed to run thinking agent",
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
