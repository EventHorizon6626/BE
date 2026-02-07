import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// POST /api/search - Intelligent web search with multi-API fallback
router.post("/", requireAuth, async (req, res) => {
  try {
    const { query, maxResults = 5, includeContent = true } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const EXA_API_KEY = process.env.EXA_API_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

    let searchResults = null;
    let usedProvider = null;
    let errors = [];

    // Strategy 1: Try Exa AI first (best for knowledge retrieval)
    if (EXA_API_KEY && EXA_API_KEY !== "your-exa-api-key-here") {
      try {
        console.log("[Search] Attempting Exa AI search...");
        const exaResponse = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": EXA_API_KEY,
          },
          body: JSON.stringify({
            query,
            num_results: maxResults,
            use_autoprompt: true,
            type: "neural",
            contents: includeContent
              ? {
                  text: true,
                  highlights: true,
                }
              : undefined,
          }),
        });

        if (exaResponse.ok) {
          const data = await exaResponse.json();
          searchResults = {
            results: data.results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text || result.highlights?.join(" ") || "",
              score: result.score,
              publishedDate: result.publishedDate,
            })),
            totalResults: data.results.length,
          };
          usedProvider = "exa";
          console.log(`[Search] Exa AI success: ${data.results.length} results`);
        } else {
          const errorText = await exaResponse.text();
          errors.push(`Exa: ${exaResponse.status} - ${errorText}`);
        }
      } catch (error) {
        errors.push(`Exa error: ${error.message}`);
        console.error("[Search] Exa AI failed:", error.message);
      }
    }

    // Strategy 2: Fallback to Tavily AI (optimized for AI agents)
    if (!searchResults && TAVILY_API_KEY && TAVILY_API_KEY !== "your-tavily-api-key-here") {
      try {
        console.log("[Search] Attempting Tavily AI search...");
        const tavilyResponse = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query,
            max_results: maxResults,
            include_answer: true,
            include_raw_content: includeContent,
            search_depth: "advanced",
          }),
        });

        if (tavilyResponse.ok) {
          const data = await tavilyResponse.json();
          searchResults = {
            results: data.results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.content || result.raw_content || "",
              score: result.score,
              publishedDate: null,
            })),
            totalResults: data.results.length,
            answer: data.answer, // Tavily provides a direct answer
          };
          usedProvider = "tavily";
          console.log(`[Search] Tavily AI success: ${data.results.length} results`);
        } else {
          const errorText = await tavilyResponse.text();
          errors.push(`Tavily: ${tavilyResponse.status} - ${errorText}`);
        }
      } catch (error) {
        errors.push(`Tavily error: ${error.message}`);
        console.error("[Search] Tavily AI failed:", error.message);
      }
    }

    // Strategy 3: Last resort - Perplexity AI
    if (!searchResults && PERPLEXITY_API_KEY && PERPLEXITY_API_KEY !== "your-perplexity-api-key-here") {
      try {
        console.log("[Search] Attempting Perplexity AI search...");
        const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
          },
          body: JSON.stringify({
            model: "llama-3.1-sonar-small-128k-online",
            messages: [
              {
                role: "system",
                content: "You are a helpful search assistant. Provide concise, factual answers with sources.",
              },
              {
                role: "user",
                content: query,
              },
            ],
            max_tokens: 500,
            temperature: 0.2,
            return_citations: true,
            return_images: false,
          }),
        });

        if (perplexityResponse.ok) {
          const data = await perplexityResponse.json();
          const answer = data.choices[0]?.message?.content || "";
          const citations = data.citations || [];

          searchResults = {
            results: citations.map((url, index) => ({
              title: `Source ${index + 1}`,
              url,
              snippet: "",
              score: 1 - index * 0.1,
              publishedDate: null,
            })),
            totalResults: citations.length,
            answer, // Perplexity provides a synthesized answer
          };
          usedProvider = "perplexity";
          console.log(`[Search] Perplexity AI success with ${citations.length} citations`);
        } else {
          const errorText = await perplexityResponse.text();
          errors.push(`Perplexity: ${perplexityResponse.status} - ${errorText}`);
        }
      } catch (error) {
        errors.push(`Perplexity error: ${error.message}`);
        console.error("[Search] Perplexity AI failed:", error.message);
      }
    }

    // If all strategies failed
    if (!searchResults) {
      console.error("[Search] All search providers failed:", errors);
      return res.status(503).json({
        success: false,
        error: "All search providers are unavailable. Please try again later.",
        details: errors,
      });
    }

    // Return successful results
    res.json({
      success: true,
      data: searchResults,
      provider: usedProvider,
      query,
    });
  } catch (error) {
    console.error("[Search] Unexpected error:", error);
    res.status(500).json({
      success: false,
      error: "Search failed",
      details: error.message,
    });
  }
});

export default router;
