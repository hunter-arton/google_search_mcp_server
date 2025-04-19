import dotenv from "dotenv"
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();
const WEB_SEARCH_TOOL: Tool = {
  name: "google_web_search",
  description:
    "Performs a web search using the Google Custom Search API, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports pagination and filtering by site or type. " +
    "Maximum 10 results per request, with start index for pagination. ",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      count: {
        type: "number",
        description: "Number of results (1-10, default 5)",
        default: 5
      },
      start: {
        type: "number",
        description: "Pagination start index (default 1)",
        default: 1
      },
      site: {
        type: "string",
        description: "Optional: Limit search to specific site (e.g., 'site:example.com')",
        default: ""
      },
    },
    required: ["query"],
  },
};

const IMAGE_SEARCH_TOOL: Tool = {
  name: "google_image_search",
  description:
    "Searches for images using Google's Custom Search API. " +
    "Best for finding images related to specific terms, concepts, or objects. " +
    "Returns image URLs, titles, and thumbnails. " +
    "Use this when needing to find relevant images or visual references.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Image search query"
      },
      count: {
        type: "number",
        description: "Number of results (1-10, default 5)",
        default: 5
      },
      start: {
        type: "number",
        description: "Pagination start index (default 1)",
        default: 1
      },
    },
    required: ["query"]
  }
};

// Server implementation
const server = new Server(
  {
    name: "example-servers/google-search",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Check for API key and Search Engine ID
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

if (!GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY environment variable is required");
  process.exit(1);
}

if (!GOOGLE_CSE_ID) {
  console.error("Error: GOOGLE_CSE_ID environment variable is required");
  process.exit(1);
}

// Google API free tier allows 100 search queries per day
const RATE_LIMIT = {
  perDay: 100,
  perSecond: 5 // To prevent too many requests at once
};

let requestCount = {
  daily: 0,
  second: 0,
  lastSecondReset: Date.now(),
  lastDayReset: new Date().setHours(0, 0, 0, 0) // Start of day
};

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
    throw new Error('Rate limit exceeded');
  }
  
  requestCount.second++;
  requestCount.daily++;
}

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

function isGoogleWebSearchArgs(args: unknown): args is { query: string; count?: number; start?: number; site?: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

function isGoogleImageSearchArgs(args: unknown): args is { query: string; count?: number; start?: number } {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

async function performWebSearch(query: string, count: number = 5, start: number = 1, site: string = "") {
  checkRateLimit();
  
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

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const data = await response.json() as GoogleSearchResult;
  
  if (data.error) {
    throw new Error(`Google API error: ${data.error.code} ${data.error.message}`);
  }

  if (!data.items || data.items.length === 0) {
    return "No results found for your query.";
  }

  // Format the results
  return data.items.map((item, index) => 
    `[${index + 1}] Title: ${item.title}\nDescription: ${item.snippet}\nURL: ${item.link}`
  ).join('\n\n');
}

async function performImageSearch(query: string, count: number = 5, start: number = 1) {
  checkRateLimit();
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('cx', GOOGLE_CSE_ID);
  url.searchParams.set('q', query);
  url.searchParams.set('num', Math.min(count, 10).toString());
  url.searchParams.set('start', start.toString());
  url.searchParams.set('searchType', 'image');

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const data = await response.json() as GoogleImageSearchResult;
  
  if (data.error) {
    throw new Error(`Google API error: ${data.error.code} ${data.error.message}`);
  }

  if (!data.items || data.items.length === 0) {
    return "No image results found for your query.";
  }

  // Format the image results
  return data.items.map((item, index) => 
    `[${index + 1}] Title: ${item.title}\nDescription: ${item.snippet || 'No description'}\nImage URL: ${item.link}\n${item.image?.thumbnailLink ? `Thumbnail: ${item.image.thumbnailLink}` : ''}`
  ).join('\n\n');
}

// Tool handlers
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
      case "google_web_search": {
        if (!isGoogleWebSearchArgs(args)) {
          throw new Error("Invalid arguments for google_web_search");
        }
        const { query, count = 5, start = 1, site = "" } = args;
        const results = await performWebSearch(query, count, start, site);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "google_image_search": {
        if (!isGoogleImageSearchArgs(args)) {
          throw new Error("Invalid arguments for google_image_search");
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
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});