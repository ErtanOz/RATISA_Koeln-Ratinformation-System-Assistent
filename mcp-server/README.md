# OParl Köln MCP Server

This is a Model Context Protocol (MCP) server that connects AI assistants to the City of Cologne's Council Information System (Ratsinformationssystem) via the OParl API.

## Setup

1.  Navigate to this directory:
    ```bash
    cd mcp-server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the server:
    ```bash
    npm run build
    ```

## Usage

Configure your MCP client (e.g., Claude Desktop, Cursor, or your custom AI tool) to run this server.

**Command:** `node`
**Args:** `/absolute/path/to/mcp-server/build/index.js`

## Tools Provided

*   `search_meetings`: Find upcoming or past council meetings.
*   `search_papers`: Find documents, motions, and voting records.
*   `search_organizations`: Find committees and groups.
*   `search_people`: Find council members.
*   `get_details`: Deep dive into a specific item found in search results.
