import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = "https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln";

// --- Types & Helpers ---

async function fetchOparl(endpoint: string, params: Record<string, string> = {}) {
  // Handle full URLs (for get_details) vs endpoints
  const urlStr = endpoint.startsWith('http') ? endpoint : `${BASE_URL}/${endpoint}`;
  const url = new URL(urlStr);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, value);
  });

  // console.error(`Fetching: ${url.toString()}`); // Debug log to stderr (hidden from AI)

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OParl API Error: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// Data Simplifiers to save context tokens
function simplifyMeeting(m: any) {
  return {
    id: m.id,
    name: m.name,
    start: m.start,
    end: m.end,
    location: typeof m.location === 'object' ? m.location?.description : m.location,
    organization: m.organization?.[0]
  };
}

function simplifyPaper(p: any) {
  return {
    id: p.id,
    name: p.name,
    reference: p.reference,
    date: p.date,
    type: p.paperType,
    mainFileUrl: p.mainFile?.accessUrl
  };
}

function simplifyPerson(p: any) {
    return {
        id: p.id,
        name: p.name,
        party: p.membership?.[0]?.organization // Approximate
    };
}

// --- Tool Definitions ---

const TOOLS: Tool[] = [
  {
    name: "search_meetings",
    description: "Search for council meetings (Sitzungen). Useful to find dates, agendas, or locations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term for the meeting title" },
        minDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        maxDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "search_papers",
    description: "Search for parliamentary papers (Vorlagen, Anträge, Beschlüsse).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (e.g. 'Cycle path', 'School')" },
        type: { 
          type: "string",
          enum: ["Antrag", "Anfrage", "Mitteilung", "Beschlussvorlage"],
          description: "Type of paper"
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_organizations",
    description: "Search for committees or political groups (Gremien).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name of the organization" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_people",
    description: "Search for council members or people.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name of the person" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_details",
    description: "Retrieve full details for a specific resource using its ID/URL found in search results.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full ID URL of the resource" },
      },
      required: ["url"],
    },
  },
];

// --- Server Setup ---

const server = new Server(
  {
    name: "oparl-koeln-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "search_meetings") {
      const { query, minDate, maxDate } = args as any;
      const params: any = { sort: "start" }; // Default sort
      if (query) params.q = query;
      if (minDate) params.minDate = minDate;
      if (maxDate) params.maxDate = maxDate;

      const data = await fetchOparl("meetings", params);
      return {
        content: [{ type: "text", text: JSON.stringify(data.data.map(simplifyMeeting), null, 2) }],
      };
    }

    if (name === "search_papers") {
      const { query, type } = args as any;
      const params: any = { q: query, sort: "-date" };
      if (type) params.paperType = type;

      const data = await fetchOparl("papers", params);
      return {
        content: [{ type: "text", text: JSON.stringify(data.data.map(simplifyPaper), null, 2) }],
      };
    }

    if (name === "search_organizations") {
      const { query } = args as any;
      const data = await fetchOparl("organizations", { "q": query });
      
      const simplified = data.data.map((o: any) => ({
        id: o.id,
        name: o.name,
        type: o.organizationType
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
      };
    }

    if (name === "search_people") {
        const { query } = args as any;
        const data = await fetchOparl("people", { "q": query });
        return {
            content: [{ type: "text", text: JSON.stringify(data.data.map(simplifyPerson), null, 2) }]
        };
    }

    if (name === "get_details") {
      const { url } = args as any;
      const data = await fetchOparl(url);
      // Return full data for details, AI can parse it
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// --- Startup ---

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OParl Köln MCP Server running on stdio...");
}

run().catch((error) => {
  console.error("Fatal error starting server:", error);
  // Fix: Property 'exit' does not exist on type 'Process'
  (process as any).exit(1);
});