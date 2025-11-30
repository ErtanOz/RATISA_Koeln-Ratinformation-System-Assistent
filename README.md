
<img width="1538" height="892" alt="image" src="https://github.com/user-attachments/assets/b9831614-3d35-4a09-8613-1885825796ec" />

# RATISA - Köln Ratinformation System Assistent 🏛️

A modern, AI-powered web interface for the Council Information System (Ratsinformationssystem) of the City of Cologne, built on the [OParl API](https://oparl.org/).

Includes a **Model Context Protocol (MCP)** server to connect external AI agents (like Claude or Cursor) directly to live council data.

## ✨ Features

*   **Modern Dashboard**: Overview of upcoming meetings and recent papers.
*   **AI Integration**: 
    *   Natural language search ("Find motions by the Greens about bike paths from 2024").
    *   One-click summaries of complex PDF attachments and meeting agendas using Gemini Flash.
*   **Global Search**: Unified search across Meetings, Papers, People, and Organizations.
*   **Favorites**: Bookmark important items locally.
*   **MCP Server**: Connect your local LLMs to the Cologne City data.

## 🚀 Quickstart (Web App)

1.  **Install dependencies**
    ```bash
    npm install
    ```

2.  **Configure Environment**
    Create a `.env` file and add your Google Gemini API Key:
    ```env
    API_KEY=your_gemini_api_key_here
    ```

3.  **Start Development Server**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` (or similar) in your browser.

## Quickstart (MCP Server)

Enable your AI assistant (Claude Desktop, Cursor, etc.) to query Cologne council data directly.

1.  **Build the Server**
    ```bash
    cd mcp-server
    npm install
    npm run build
    ```

2.  **Configure Client (e.g., Claude Desktop)**
    Add this to your `claude_desktop_config.json`:
    ```json
    {
      "mcpServers": {
        "ratsinfo-koeln": {
          "command": "node",
          "args": ["/ABSOLUTE/PATH/TO/REPO/mcp-server/build/index.js"]
        }
      }
    }
    ```

##  Tech Stack

*   **Frontend**: React, TypeScript, Tailwind CSS, React Router.
*   **AI**: Google Gemini API (`gemini-2.5-flash`).
*   **Backend/MCP**: Node.js, `@modelcontextprotocol/sdk`.
*   **Data Source**: Stadt Köln OParl API.

##  License

MIT

## Run Locally


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
