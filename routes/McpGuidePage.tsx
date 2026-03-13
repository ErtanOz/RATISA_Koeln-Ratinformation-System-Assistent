import React, { useCallback, useMemo, useState } from 'react';
import { CommandLineIcon, PageTitle } from '../components/ui';
import {
  callMcpTool,
  listMcpTools,
  McpRpcResult,
  McpToolInfo,
  parseToolArguments,
} from '../services/mcpPlaygroundService';

export const McpGuidePage: React.FC = () => {
  const defaultEndpoint = process.env.VITE_MCP_HTTP_ENDPOINT || '/mcp-http';
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [apiKey, setApiKey] = useState('');
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [selectedToolName, setSelectedToolName] = useState('');
  const [toolArgsInput, setToolArgsInput] = useState('{\n  "query": "Radverkehr"\n}');
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isCallingTool, setIsCallingTool] = useState(false);
  const [argsError, setArgsError] = useState<string | null>(null);
  const [lastRpcResult, setLastRpcResult] = useState<McpRpcResult<unknown> | null>(null);

  const toolTemplates: Record<string, string> = {
    search_meetings: '{\n  "query": "Verkehr",\n  "minDate": "2026-01-01",\n  "page": 1,\n  "limit": 10\n}',
    search_papers: '{\n  "query": "Radverkehr",\n  "type": "Antrag",\n  "page": 1,\n  "limit": 10\n}',
    search_organizations: '{\n  "query": "Ausschuss",\n  "page": 1,\n  "limit": 10\n}',
    search_people: '{\n  "query": "Müller",\n  "page": 1,\n  "limit": 10\n}',
    get_details:
      '{\n  "url": "https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/papers/vo/131519"\n}',
  };

  const updateToolTemplate = useCallback((toolName: string) => {
    if (!toolName) return;
    setToolArgsInput(toolTemplates[toolName] ?? '{}');
    setArgsError(null);
  }, []);

  const handleLoadTools = useCallback(async () => {
    const normalizedEndpoint = endpoint.trim();
    if (!normalizedEndpoint) {
      setLastRpcResult({
        ok: false,
        status: 0,
        elapsedMs: 0,
        error: 'Bitte einen MCP-Endpoint eintragen.',
        raw: null,
      });
      return;
    }

    setIsLoadingTools(true);
    const result = await listMcpTools(normalizedEndpoint, apiKey || undefined);
    setLastRpcResult(result);
    setIsLoadingTools(false);

    if (result.ok) {
      const loadedTools = Array.isArray(result.result?.tools) ? result.result.tools : [];
      setTools(loadedTools);
      if (loadedTools.length > 0) {
        const nextTool = loadedTools[0].name;
        setSelectedToolName(nextTool);
        updateToolTemplate(nextTool);
      }
    }
  }, [apiKey, endpoint, updateToolTemplate]);

  const handleRunTool = useCallback(async () => {
    const normalizedEndpoint = endpoint.trim();
    if (!normalizedEndpoint) {
      setLastRpcResult({
        ok: false,
        status: 0,
        elapsedMs: 0,
        error: 'Bitte einen MCP-Endpoint eintragen.',
        raw: null,
      });
      return;
    }
    if (!selectedToolName) {
      setLastRpcResult({
        ok: false,
        status: 0,
        elapsedMs: 0,
        error: 'Bitte zuerst ein Tool auswählen.',
        raw: null,
      });
      return;
    }

    const parsedArgs = parseToolArguments(toolArgsInput);
    if (!parsedArgs.ok && 'error' in parsedArgs) {
      setArgsError(parsedArgs.error);
      return;
    }

    setArgsError(null);
    setIsCallingTool(true);
    const result = await callMcpTool(
      normalizedEndpoint,
      selectedToolName,
      parsedArgs.value,
      apiKey || undefined,
    );
    setLastRpcResult(result);
    setIsCallingTool(false);
  }, [apiKey, endpoint, selectedToolName, toolArgsInput]);

  const responsePreview = useMemo(() => {
    if (!lastRpcResult) return '';
    return JSON.stringify(lastRpcResult.raw, null, 2);
  }, [lastRpcResult]);

  return (
    <div className="animate-in fade-in duration-300 max-w-4xl mx-auto py-8">
      <PageTitle
        title="MCP Server Integration"
        subtitle="Verbinden Sie Ihre KI mit dem Ratsinformationssystem"
      />

      <div className="app-surface mb-8 p-8">
        <h2 className="mb-4 text-xl font-semibold text-app-text">MCP Playground (HTTP)</h2>
        <p className="mb-6 text-sm text-app-muted">
          Testen Sie den HTTP-MCP-Endpoint direkt im Browser: Tools laden, Argumente editieren
          und Calls ausführen.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="app-label">Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              className="app-input"
              placeholder="/mcp-http"
            />
          </div>
          <div>
            <label className="app-label">
              API Key (optional)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="app-input"
              placeholder="x-mcp-api-key oder Bearer"
            />
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleLoadTools}
            disabled={isLoadingTools}
            className="app-button-info"
          >
            {isLoadingTools ? 'Lädt...' : 'Tools laden'}
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="app-label">Tool</label>
            <select
              value={selectedToolName}
              onChange={(event) => {
                const nextTool = event.target.value;
                setSelectedToolName(nextTool);
                updateToolTemplate(nextTool);
              }}
              className="app-select"
            >
              <option value="">Bitte Tool wählen</option>
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunTool}
              disabled={isCallingTool || !selectedToolName}
              className="app-button-primary w-full"
            >
              {isCallingTool ? 'Läuft...' : 'Tool ausführen'}
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className="app-label">JSON Argumente</label>
          <textarea
            value={toolArgsInput}
            onChange={(event) => {
              setToolArgsInput(event.target.value);
              setArgsError(null);
            }}
            className="app-textarea text-app-info"
          />
          {argsError && <p className="mt-2 text-xs text-app-danger">{argsError}</p>}
        </div>

        <div className="app-code-block mt-6">
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-white/70">
            <span>Status: {lastRpcResult ? lastRpcResult.status : '-'}</span>
            <span>Dauer: {lastRpcResult ? `${lastRpcResult.elapsedMs} ms` : '-'}</span>
            <span>Result: {lastRpcResult ? (lastRpcResult.ok ? 'OK' : 'Fehler') : '-'}</span>
          </div>
          {!lastRpcResult && (
            <p className="text-sm text-white/60">Noch kein MCP-Aufruf ausgeführt.</p>
          )}
          {lastRpcResult && !lastRpcResult.ok && (
            <p className="mb-2 text-sm text-red-200">{lastRpcResult.error}</p>
          )}
          {responsePreview && (
            <pre className="max-h-72 overflow-auto text-xs text-white/80">{responsePreview}</pre>
          )}
        </div>
      </div>

      <div className="app-surface mb-8 p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="rounded-xl bg-app-info/10 p-3 text-app-info">
            <CommandLineIcon />
          </div>
          <div>
            <h2 className="mb-2 text-xl font-semibold text-app-text">Was ist das?</h2>
            <p className="leading-relaxed text-app-muted">
              Das <strong>Model Context Protocol (MCP)</strong> ermöglicht es KI-Assistenten wie
              Claude Desktop oder IDEs (Cursor), direkt mit externen Datenquellen zu kommunizieren.
              Wir stellen einen vorgefertigten MCP-Server bereit, der als Brücke zwischen Ihrer KI
              und dem OParl-System der Stadt Köln fungiert.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="border-b border-app-border pb-2 text-lg font-semibold text-app-text">
            Schnellstart
          </h3>

          <div className="space-y-4">
            <div className="flex gap-4 items-center">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-surface-alt font-bold text-app-muted">
                1
              </span>
              <div className="flex-1">
                <p className="font-medium text-app-text">Server herunterladen & bauen</p>
                <div className="app-code-block mt-2 overflow-x-auto">
                  cd mcp-server
                  <br />
                  npm install
                  <br />
                  npm run build
                </div>
              </div>
            </div>

            <div className="flex gap-4 items-center">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-surface-alt font-bold text-app-muted">
                2
              </span>
              <div className="flex-1">
                <p className="font-medium text-app-text">In Claude Desktop konfigurieren</p>
                <p className="mb-2 text-sm text-app-muted">
                  Bearbeiten Sie Ihre config Datei (z.B. <code>claude_desktop_config.json</code>):
                </p>
                <div className="app-code-block overflow-x-auto text-app-success">
{`{
  "mcpServers": {
    "ratsinfo-koeln": {
      "command": "node",
      "args": ["/PFAD/ZU/DIESEM/PROJEKT/mcp-server/build/index.js"]
    }
  }
}`}
                </div>
              </div>
            </div>

            <div className="flex gap-4 items-center">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-surface-alt font-bold text-app-muted">
                3
              </span>
              <div className="flex-1">
                <p className="font-medium text-app-text">HTTP Dev Server starten (für Playground)</p>
                <div className="app-code-block mt-2 overflow-x-auto">
                  npm run mcp:http:dev
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="app-surface p-6">
          <h4 className="mb-4 flex items-center gap-2 font-semibold text-app-text">Verfügbare Tools</h4>
          <ul className="space-y-3 text-sm text-app-muted">
            <li className="flex gap-2">
              <span className="font-mono text-app-info">search_meetings</span> Findet Sitzungen
              nach Thema/Datum
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-app-info">search_papers</span> Durchsucht Anträge &
              Vorlagen
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-app-info">search_organizations</span> Findet
              Gremien & Ausschüsse
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-app-info">search_people</span> Findet
              Mandatsträger
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-app-info">get_details</span> Lädt Details zu ID/URL
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-app-info/20 bg-app-info/10 p-6">
          <h4 className="mb-4 flex items-center gap-2 font-semibold text-app-text">Beispiel-Prompts</h4>
          <ul className="space-y-3 text-sm text-app-text">
            <li>"Wann tagt der Verkehrsausschuss das nächste Mal?"</li>
            <li>"Fasse mir die aktuellen Anträge zum Thema Radverkehr zusammen."</li>
            <li>"Wer sitzt für die Grünen im Rat?"</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default McpGuidePage;
