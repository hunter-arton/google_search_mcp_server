import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Load environment variables
dotenv.config();

// Constants
const SERVER_NAME = "velvet-google-search-mcps";
const SERVER_VERSION = "1.0.0";
const WEB_SEARCH_TOOL_NAME = "velvet_web_search";
const IMAGE_SEARCH_TOOL_NAME = "velvet_image_search";

// Rate limiting
const RATE_LIMIT = {
  perDay: 100,  // Google API free tier allows 100 search queries per day
  perSecond: 5, // To prevent too many requests at once
};

let requestCount = {
  daily: 0,
  second: 0,
  lastSecondReset: Date.now(),
  lastDayReset: new Date().setHours(0, 0, 0, 0), // Start of day
};

// Type definitions
interface GoogleSearchResult {
  kind: string;
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
    pagemap?: {
      cse_thumbnail?: Array<{
        src: string;
        width: string;
        height: string;
      }>;
      metatags?: Array<Record<string, string>>;
    };
    displayLink?: string;
    formattedUrl?: string;
  }>;
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface GoogleImageSearchResult {
  kind: string;
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
    image?: {
      contextLink: string;
      height: number;
      width: number;
      thumbnailLink: string;
      thumbnailHeight: number;
      thumbnailWidth: number;
    };
  }>;
  error?: {
    code: number;
    message: string;
  };
}

interface WebSearchArgs {
  query: string;
  count?: number;
  start?: number;
  site?: string;
}

interface ImageSearchArgs {
  query: string;
  count?: number;
  start?: number;
}

// Tool definitions
const WEB_SEARCH_TOOL: Tool = {
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "Performs a web search using the Google Custom Search API, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports pagination and filtering by site or type. " +
    "Maximum 10 results per request, with start index for pagination. " +
    "Example: Find information about climate change initiatives in Europe.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      count: {
        type: "number",
        description: "Number of results (1-10, default 5)",
        default: 5,
      },
      start: {
        type: "number",
        description: "Pagination start index (default 1)",
        default: 1,
      },
      site: {
        type: "string",
        description: "Optional: Limit search to specific site (e.g., 'example.com')",
        default: "",
      },
    },
    required: ["query"],
  },
};

const IMAGE_SEARCH_TOOL: Tool = {
  name: IMAGE_SEARCH_TOOL_NAME,
  description:
    "Searches for images using Google's Custom Search API. " +
    "Best for finding images related to specific terms, concepts, or objects. " +
    "Returns image URLs, titles, and thumbnails. " +
    "Use this when needing to find relevant images or visual references. " +
    "Example: Find images of sustainable architecture.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Image search query",
      },
      count: {
        type: "number",
        description: "Number of results (1-10, default 5)",
        default: 5,
      },
      start: {
        type: "number",
        description: "Pagination start index (default 1)",
        default: 1,
      },
    },
    required: ["query"],
  },
};

// Server initialization
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Check and validate API credentials
function validateApiCredentials() {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is required");
  }

  if (!GOOGLE_CSE_ID) {
    throw new Error("GOOGLE_CSE_ID environment variable is required");
  }

  // Basic format validation for Google API key
  if (!/^[A-Za-z0-9_-]{20,}$/.test(GOOGLE_API_KEY)) {
    console.warn("Warning: GOOGLE_API_KEY may have an invalid format");
  }

  // Basic format validation for CSE ID
  if (!/^\d{10}:[a-z0-9]+$/.test(GOOGLE_CSE_ID)) {
    console.warn("Warning: GOOGLE_CSE_ID may have an invalid format");
  }

  return { GOOGLE_API_KEY, GOOGLE_CSE_ID };
}

// Helper functions
function checkRateLimit() {
  const now = Date.now();
  
  // Reset second counter if it's been a second
  if (now - requestCount.lastSecondReset > 1000) {
    requestCount.second = 0;
    requestCount.lastSecondReset = now;
  }
  
  // Reset daily counter if it's a new day
  const todayStart = new Date().setHours(0, 0, 0, 0);
  if (todayStart > requestCount.lastDayReset) {
    requestCount.daily = 0;
    requestCount.lastDayReset = todayStart;
  }
  
  if (requestCount.second >= RATE_LIMIT.perSecond || 
      requestCount.daily >= RATE_LIMIT.perDay) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  requestCount.second++;
  requestCount.daily++;
}

// Enhanced type guards with more detailed validation
function isWebSearchArgs(args: unknown): args is WebSearchArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }
  
  const a = args as Partial<WebSearchArgs>;
  
  // Validate required field
  if (typeof a.query !== "string" || a.query.trim() === "") {
    return false;
  }
  
  // Validate optional fields if present
  if (a.count !== undefined && (typeof a.count !== "number" || a.count < 1 || a.count > 10)) {
    return false;
  }
  
  if (a.start !== undefined && (typeof a.start !== "number" || a.start < 1)) {
    return false;
  }
  
  if (a.site !== undefined && typeof a.site !== "string") {
    return false;
  }
  
  return true;
}

function isImageSearchArgs(args: unknown): args is ImageSearchArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }
  
  const a = args as Partial<ImageSearchArgs>;
  
  // Validate required field
  if (typeof a.query !== "string" || a.query.trim() === "") {
    return false;
  }
  
  // Validate optional fields if present
  if (a.count !== undefined && (typeof a.count !== "number" || a.count < 1 || a.count > 10)) {
    return false;
  }
  
  if (a.start !== undefined && (typeof a.start !== "number" || a.start < 1)) {
    return false;
  }
  
  return true;
}

async function performWebSearch(query: string, count: number = 5, start: number = 1, site: string = "") {
  checkRateLimit();
  
  // Validate credentials each time to ensure they're available
  const { GOOGLE_API_KEY, GOOGLE_CSE_ID } = validateApiCredentials();
  
  let searchQuery = query;
  // If site is provided, append it to the query
  if (site && !query.includes("site:")) {
    searchQuery = `${query} site:${site}`;
  }
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('cx', GOOGLE_CSE_ID);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('num', Math.min(count, 10).toString()); // API limit is 10
  url.searchParams.set('start', start.toString());

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json() as GoogleSearchResult;
    
    if (data.error) {
      throw new Error(`Google API error: ${data.error.code} ${data.error.message}`);
    }

    if (!data.items || data.items.length === 0) {
      return "No results found for your query.";
    }

    // Improved formatting with consistent structure and error handling for missing fields
    return data.items.map((item, index) => {
      const title = item.title || 'No title available';
      const snippet = item.snippet || 'No description available';
      const link = item.link || 'No URL available';
      
      return `[${index + 1}] Title: ${title}\nDescription: ${snippet}\nURL: ${link}`;
    }).join('\n\n');
  } catch (error) {
    if (error instanceof Error) {
      // Check for common API errors and provide more helpful messages
      if (error.message.includes('invalid key')) {
        throw new Error('API key is invalid. Please check your Google API credentials.');
      } else if (error.message.includes('Daily Limit Exceeded')) {
        throw new Error('Google API daily limit exceeded. Please try again tomorrow.');
      }
      throw error;
    }
    throw new Error('Unknown error occurred during Google search');
  }
}

async function performImageSearch(query: string, count: number = 5, start: number = 1) {
  checkRateLimit();
  
  // Validate credentials each time to ensure they're available
  const { GOOGLE_API_KEY, GOOGLE_CSE_ID } = validateApiCredentials();
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('cx', GOOGLE_CSE_ID);
  url.searchParams.set('q', query);
  url.searchParams.set('num', Math.min(count, 10).toString());
  url.searchParams.set('start', start.toString());
  url.searchParams.set('searchType', 'image');

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json() as GoogleImageSearchResult;
    
    if (data.error) {
      throw new Error(`Google API error: ${data.error.code} ${data.error.message}`);
    }

    if (!data.items || data.items.length === 0) {
      return "No image results found for your query.";
    }

    // Improved formatting with consistent structure and error handling for missing fields
    return data.items.map((item, index) => {
      const title = item.title || 'No title available';
      const snippet = item.snippet || 'No description available';
      const link = item.link || 'No image URL available';
      const thumbnail = item.image?.thumbnailLink || 'No thumbnail available';
      
      return `[${index + 1}] Title: ${title}\nDescription: ${snippet}\nImage URL: ${link}\nThumbnail: ${thumbnail}`;
    }).join('\n\n');
  } catch (error) {
    if (error instanceof Error) {
      // Check for common API errors and provide more helpful messages
      if (error.message.includes('invalid key')) {
        throw new Error('API key is invalid. Please check your Google API credentials.');
      } else if (error.message.includes('Daily Limit Exceeded')) {
        throw new Error('Google API daily limit exceeded. Please try again tomorrow.');
      }
      throw error;
    }
    throw new Error('Unknown error occurred during Google image search');
  }
}

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case WEB_SEARCH_TOOL_NAME: {
        if (!isWebSearchArgs(args)) {
          throw new Error(`Invalid arguments for ${WEB_SEARCH_TOOL_NAME}. Expected query (string), optional count (1-10), start (>=1), and site (string).`);
        }
        const { query, count = 5, start = 1, site = "" } = args;
        const results = await performWebSearch(query, count, start, site);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case IMAGE_SEARCH_TOOL_NAME: {
        if (!isImageSearchArgs(args)) {
          throw new Error(`Invalid arguments for ${IMAGE_SEARCH_TOOL_NAME}. Expected query (string), optional count (1-10), and start (>=1).`);
        }
        const { query, count = 5, start = 1 } = args;
        const results = await performImageSearch(query, count, start);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}. Available tools are ${WEB_SEARCH_TOOL_NAME} and ${IMAGE_SEARCH_TOOL_NAME}.` }],
          isError: true,
        };
    }
  } catch (error) {
    console.error("Tool execution error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Validate API credentials on startup
try {
  validateApiCredentials();
} catch (error) {
  console.error("Fatal error:", error);
  process.exit(1);
}

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error(`${SERVER_NAME} server exiting due to SIGINT`);
  server.close();
  process.exit(0);
});

process.stdin.on("close", () => {
  console.error(`${SERVER_NAME} server exiting due to stdin close`);
  server.close();
  process.exit(0);
});

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
