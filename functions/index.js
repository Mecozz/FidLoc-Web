/**
 * FidLoc Cloud Functions
 * AI Buffer Sheet Processing Proxy
 */

const { setGlobalOptions } = require("firebase-functions/v2/options");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Define the API key as a secret (stored in Google Cloud Secret Manager)
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Set global options
setGlobalOptions({ maxInstances: 10, region: "us-east1" });

/**
 * Process buffer sheet image/file with Claude AI
 * Extracts serial numbers from equipment inventory sheets
 */
exports.processBufferSheet = onCall(
  { 
    secrets: [anthropicApiKey],
    cors: true,
    enforceAppCheck: false // Can enable later for extra security
  },
  async (request) => {
    // Check if user is authenticated
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    const { content, fileType } = request.data;

    if (!content || !Array.isArray(content)) {
      throw new HttpsError("invalid-argument", "Content array is required");
    }

    logger.info("Processing buffer sheet", { 
      userId: request.auth.uid,
      fileType: fileType || "unknown",
      contentBlocks: content.length
    });

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: content
          }]
        })
      });

      if (!response.ok) {
        const err = await response.json();
        logger.error("Anthropic API error", err);
        throw new HttpsError("internal", err.error?.message || "API request failed");
      }

      const data = await response.json();
      const text = data.content[0].text;

      // Parse serial numbers from response
      const serials = text.split("\n")
        .map(s => s.trim().toUpperCase())
        .filter(s => s.match(/^(ADTN|8612|854|841)/i));

      logger.info("Extracted serials", { count: serials.length, userId: request.auth.uid });

      return { 
        success: true, 
        serials: serials,
        rawResponse: text 
      };

    } catch (error) {
      logger.error("Processing error", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to process: " + error.message);
    }
  }
);
