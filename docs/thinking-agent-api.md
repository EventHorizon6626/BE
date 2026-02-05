# Thinking Agent API - Backend Proxy

## Overview

The backend provides a proxy endpoint for the Thinking Agent system, forwarding requests to the Event-Horizon-AI service while handling authentication and error management.

## Endpoint

### `POST /ai/agents/think`

Proxy endpoint for iterative thinking agent execution.

**Authentication**: Required (uses `requireAuth` middleware)

#### Request Body

```json
{
  "stocks": ["AAPL", "TSLA"],
  "input_data": { ... },
  "system_prompt": "You are a dividend-focused analyst...",
  "max_iterations": 5,
  "available_tools": ["candlestick", "earnings", "news", "technical", "fundamentals"]
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `stocks` | `string[]` | Yes | - | List of stock symbols |
| `input_data` | `object` | No | `null` | Data from prior agent |
| `system_prompt` | `string` | Yes | - | Agent's system prompt |
| `max_iterations` | `number` | No | `5` | Max thinking iterations |
| `available_tools` | `string[]` | No | All tools | Available data tools |

#### Response - Success

```json
{
  "status": "success",
  "final_result": { ... },
  "thinking_steps": [ ... ],
  "tools_used": ["candlestick", "fundamentals"],
  "iterations_used": 3
}
```

#### Response - Paused

```json
{
  "status": "paused",
  "reason": "need_data_agent",
  "message": "Need data agent to fetch: options chain data",
  "suggested_data_agent": {
    "name": "Options Chain Agent",
    "description": "...",
    "data_type": "options chain",
    "suggested_system_prompt": "..."
  },
  "resume_context": { ... }
}
```

#### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| `400` | Invalid request | Missing stocks array or system_prompt |
| `504` | Request timeout | AI service took too long (>3 min) |
| `503` | Service unavailable | AI service not responding |
| `500` | Internal server error | Generic error |

## Implementation

```javascript
// src/routes/ai.js

aiRouter.post("/agents/think", requireAuth, async (req, res) => {
  const { stocks, input_data, system_prompt, max_iterations, available_tools } = req.body;

  // Validation
  if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
    return res.status(400).json({ error: "stocks array is required" });
  }
  if (!system_prompt) {
    return res.status(400).json({ error: "system_prompt is required" });
  }

  // Forward to AI service
  const aiResponse = await fetch(`${AI_SERVICE_URL}/agents/think`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stocks,
      input_data: input_data || null,
      system_prompt,
      max_iterations: max_iterations || 5,
      available_tools: available_tools || ["candlestick", "earnings", "news", "technical", "fundamentals"],
    }),
    signal: AbortSignal.timeout(180000), // 3 minute timeout
  });

  return res.json(await aiResponse.json());
});
```

## Timeout Configuration

The thinking agent endpoint has a **3-minute timeout** (180,000ms) compared to the standard 60-second timeout for regular agents. This extended timeout accommodates:

- Multiple LLM calls per iteration
- Tool execution for each data request
- Final response generation

## Agent Model Schema

The Agent model includes thinking-related fields:

```javascript
// src/models/agent.js

const AgentSchema = new mongoose.Schema({
  // ... other fields ...

  // Thinking Mode Configuration
  enableThinking: {
    type: Boolean,
    default: true
  },
  maxIterations: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
});
```

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `enableThinking` | Boolean | `true` | - | Enable iterative thinking mode |
| `maxIterations` | Number | `5` | 1-10 | Maximum thinking iterations |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_SERVICE_URL` | `http://localhost:8001` | Event-Horizon-AI service URL |

## Error Handling

The proxy implements comprehensive error handling:

```javascript
try {
  // ... request handling
} catch (error) {
  // Timeout error
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return res.status(504).json({
      error: "Request timeout",
      message: "Thinking agent took too long. Try reducing max iterations.",
    });
  }

  // Connection refused
  if (error.cause?.code === "ECONNREFUSED") {
    return res.status(503).json({
      error: "Service unavailable",
      message: "AI service is not responding",
    });
  }

  // Generic error
  return res.status(500).json({
    error: "Internal server error",
    message: error.message,
  });
}
```

## Related Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ai/agents/candlestick` | POST | Price data agent |
| `/ai/agents/earnings` | POST | Earnings data agent |
| `/ai/agents/news` | POST | News data agent |
| `/ai/agents/technical` | POST | Technical indicators agent |
| `/ai/agents/fundamentals` | POST | Fundamentals data agent |
| `/ai/agents/custom` | POST | Custom agent (non-thinking) |

## See Also

- [Related Endpoints](#related-endpoints) - Other AI agent endpoints
- [Agent Model Schema](#agent-model-schema) - Thinking-related fields
- [Environment Variables](#environment-variables) - Configuration options
