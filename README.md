# Google Search MCP Server

A Model Context Protocol (MCP) server that provides web and image search capabilities through Google's Custom Search API. This server follows the MCP specification to integrate with Claude and other AI assistants.

<a href="https://glama.ai/mcp/servers/@hunter-arton/google_search_mcp_server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hunter-arton/google_search_mcp_server/badge" alt="Google Search Server MCP server" />
</a>

## What We're Building

Many AI assistants don't have up-to-date information or the ability to search the web. This MCP server solves that problem by providing two tools:

- `google_web_search`: Search the web for current information
- `google_image_search`: Find images related to queries

Once connected to an MCP-compatible client (like Claude in Cursor, VSCode, or Claude Desktop), your AI assistant can perform searches and access current information.

## Core MCP Concepts

MCP servers provide capabilities to AI assistants. This server implements:

- **Tools**: Functions that can be called by the AI (with user approval)
- **Structured Communication**: Standardized messaging format via the MCP protocol
- **Transport Layer**: Communication via standard input/output

## Prerequisites

- Node.js (v18 or higher) and npm
- Google Cloud Platform account
- Google Custom Search API key and Search Engine ID
- An MCP-compatible client (Claude for Desktop, Cursor, VSCode with Claude, etc.)

## Quick Start (Clone this Repository)

If you want to use this server without building it from scratch, follow these steps:

```bash
# Clone the repository
git clone https://github.com/yourusername/google-search-mcp-server.git
cd google-search-mcp-server

# Install dependencies
npm install

# Set up your environment variables
# Setup .env file in the root folder of the project

# On macOS/Linux
touch .env

# On Windows
new-item .env

# Edit .env file to add your Google API credentials
# Use any text editor you prefer (VS Code, Notepad, nano, vim, etc.)
# Add these to your newly created .env

GOOGLE_API_KEY=your_api_key_here
GOOGLE_CSE_ID=your_search_engine_id_here

# Build the server
npm run build

# Test the server (optional)
# On macOS/Linux
echo '{"jsonrpc":"2.0","method":"listTools","id":1}' | node dist/index.js

# On Windows PowerShell
echo '{"jsonrpc":"2.0","method":"listTools","id":1}' | node dist/index.js

# On Windows CMD
echo {"jsonrpc":"2.0","method":"listTools","id":1} | node dist/index.js
```

After building, follow the [Connecting to MCP Clients](#connecting-to-mcp-clients) section to connect the server to your preferred client.

## Set Up Your Environment (Build from Scratch)

If you prefer to build the server yourself from scratch, follow these instructions:

### Create Project Structure

#### macOS/Linux
```bash
# Create a new directory for our project
mkdir google-search-mcp
cd google-search-mcp

# Initialize a new npm project
npm init -y

# Install dependencies
npm install @modelcontextprotocol/sdk dotenv zod
npm install -D @types/node typescript

# Create our files
mkdir src
touch src/index.ts
```

#### Windows
```bash
# Create a new directory for our project
md google-search-mcp
cd google-search-mcp

# Initialize a new npm project
npm init -y

# Install dependencies
npm install @modelcontextprotocol/sdk dotenv zod
npm install -D @types/node typescript

# Create our files
md src
new-item src\index.ts
```

### Configure TypeScript

Create a `tsconfig.json` in the root directory:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Update package.json

Ensure your `package.json` includes:

```json
{
  "name": "google_search_mcp",
  "version": "0.1.0",
  "description": "MCP server for Google Custom Search API integration",
  "license": "MIT",
  "type": "module",
  "bin": {
    "google_search": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "build:unix": "tsc && chmod 755 dist/index.js",
    "prepare": "npm run build",
    "watch": "tsc --watch",
    "start": "node dist/index.js"
  }
}
```

## Google API Setup

You'll need to set up Google Cloud Platform and get API credentials:

### Google Cloud Platform Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Custom Search API:
   ```
   Navigate to "APIs & Services" → "Library"
   Search for "Custom Search API"
   Click on "Custom Search API" → "Enable"
   ```
4. Create API credentials:
   ```
   Navigate to "APIs & Services" → "Credentials"
   Click "Create Credentials" → "API key"
   Copy your API key
   ```

### Custom Search Engine Setup

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click "Add" to create a new search engine
3. Select "Search the entire web" and name your search engine
4. Get your Search Engine ID (cx value) from the Control Panel

### Environment Configuration

Create a `.env` file in the root directory:

```
GOOGLE_API_KEY=your_api_key_here
GOOGLE_CSE_ID=your_search_engine_id_here
```

Add `.env` to your `.gitignore` file to protect your credentials:
```
echo ".env" >> .gitignore
```

## Building Your Server

### Create the Server Implementation

Create your server implementation in `src/index.ts`:

```typescript
import dotenv from "dotenv"
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

// Define your tools
const WEB_SEARCH_TOOL: Tool = {
  name: "google_web_search",
  description: "Performs a web search using Google's Custom Search API...",
  inputSchema: {
    // Schema details here
  },
};

const IMAGE_SEARCH_TOOL: Tool = {
  name: "google_image_search",
  description: "Searches for images using Google's Custom Search API...",
  inputSchema: {
    // Schema details here
  }
};

// Server implementation
const server = new Server(
  {
    name: "google-search",
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

if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
  console.error("Error: Missing environment variables");
  process.exit(1);
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Implement tool handlers
});

// Run the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
```

For the complete implementation details, see the repository files.

### Building the Server

After completing your implementation, build the server:

```bash
npm run build
```

This will compile the TypeScript code to JavaScript in the `dist` directory.

## Connecting to MCP Clients

MCP servers can be connected to various clients. Here are setup instructions for popular ones:

### Claude for Desktop

#### macOS/Linux
1. Open your configuration file:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Add the server configuration:
```json
{
  "mcpServers": {
    "google_search": {
      "command": "node",
      "args": [
        "/absolute/path/to/google-search-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

#### Windows
1. Open your configuration file:
```bash
code $env:AppData\Claude\claude_desktop_config.json
```

2. Add the server configuration:
```json
{
  "mcpServers": {
    "google_search": {
      "command": "node",
      "args": [
        "C:\\absolute\\path\\to\\google-search-mcp\\dist\\index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

3. Restart Claude for Desktop
4. Verify the tools appear by clicking the tool icon in the interface

### VSCode with Claude

#### macOS/Linux & Windows
1. Install the [MCP Extension for VSCode](https://marketplace.visualstudio.com/items?itemName=anthropic.mcp)
2. Create or edit `.vscode/settings.json` in your workspace:

For macOS/Linux:
```json
{
  "mcp.servers": {
    "google_search": {
      "command": "node",
      "args": [
        "/absolute/path/to/google-search-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

For Windows:
```json
{
  "mcp.servers": {
    "google_search": {
      "command": "node",
      "args": [
        "C:\\absolute\\path\\to\\google-search-mcp\\dist\\index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

3. Restart VSCode
4. The tools will be available to Claude in VSCode

### Cursor

1. Open Cursor settings (gear icon)
2. Search for "MCP" and open MCP settings
3. Click "Add new MCP server"
4. Configure with similar settings to above:

For macOS/Linux:
```json
{
  "mcpServers": {
    "google_search": {
      "command": "node",
      "args": [
        "/absolute/path/to/google-search-mcp/dist/index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

For Windows:
```json
{
  "mcpServers": {
    "google_search": {
      "command": "node",
      "args": [
        "C:\\absolute\\path\\to\\google-search-mcp\\dist\\index.js"
      ],
      "env": {
        "GOOGLE_API_KEY": "your_api_key_here",
        "GOOGLE_CSE_ID": "your_search_engine_id_here"
      }
    }
  }
}
```

5. Restart Cursor

## Testing Your Server

### Using with Claude

Once connected, you can test the tools by asking Claude questions like:

- "Search for the latest news about renewable energy"
- "Find images of electric vehicles"
- "What are the top tourist destinations in Japan?"

Claude will automatically use the appropriate search tool when needed.

### Manual Testing

You can also test your server directly:

```bash
# Test web search
echo '{
  "jsonrpc": "2.0",
  "method": "callTool",
  "params": {
    "name": "google_web_search",
    "arguments": {
      "query": "test query",
      "count": 2
    }
  },
  "id": 1
}' | node dist/index.js
```

## What's Happening Under the Hood

When you ask a question:

1. The client sends your question to Claude
2. Claude analyzes the available tools and decides which to use
3. The client executes the chosen tool through your MCP server
4. The results are sent back to Claude
5. Claude formulates a natural language response based on the search results
6. The response is displayed to you

## Troubleshooting

### Common Issues

#### Environment Variables

If you see `Error: GOOGLE_API_KEY environment variable is required`:

```bash
# Check your .env file
cat .env

# Try setting environment variables directly:
export GOOGLE_API_KEY=your_key_here
export GOOGLE_CSE_ID=your_id_here
```

#### API Errors

If you encounter API errors:

```bash
# Test your API credentials directly
curl "https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_CX_ID&q=test"
```

#### Connection Issues

If your client can't connect to the server:

```bash
# Verify the server runs correctly on its own
node dist/index.js

# Check file permissions
chmod 755 dist/index.js

# Ensure you're using absolute paths in your configuration
```

## API Reference

### `google_web_search`

Performs a web search using Google's Custom Search API.

**Parameters:**
- `query` (string, required): The search query
- `count` (number, optional): Number of results (1-10, default 5)
- `start` (number, optional): Pagination start index (default 1)
- `site` (string, optional): Limit search to specific site (e.g., 'example.com')

### `google_image_search`

Searches for images using Google's Custom Search API.

**Parameters:**
- `query` (string, required): The image search query
- `count` (number, optional): Number of results (1-10, default 5)
- `start` (number, optional): Pagination start index (default 1)

## Limitations

- Free tier of Google Custom Search API: 100 queries per day
- Server-enforced rate limit: 5 requests per second
- Maximum 10 results per query (Google API limitation)

## License

This project is licensed under the MIT License - see the LICENSE file for details.