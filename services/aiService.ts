
import { GoogleGenAI, Type } from "@google/genai";

// Initialize with a fallback to avoid crash on init if key is missing, 
// but validate before usage inside the function.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'DUMMY_KEY' });

export interface Attachment {
  url: string;
  mimeType: string;
}

export interface StructuredSearch {
  resource: 'meetings' | 'papers' | 'people' | 'organizations' | 'all';
  q?: string;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

// Proxy to bypass CORS restrictions on government servers for client-side demos
const CORS_PROXY = 'https://corsproxy.io/?';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB Limit to prevent browser crashes

async function fetchFileAsBase64(url: string): Promise<string> {
  let response: Response | undefined;
  let fetchError: any;

  // 1. Attempt Direct Fetch (fastest, but likely to fail due to CORS on external servers)
  try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Short timeout for direct fetch
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
  } catch (e) {
      fetchError = e;
  }

  // 2. Fallback to CORS Proxy if direct fetch failed or wasn't ok (e.g. opaque response)
  if (!response || !response.ok) {
      try {
          // Encode the target URL component
          const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
          response = await fetch(proxyUrl);
      } catch (proxyError) {
          console.warn(`Proxy fetch failed for ${url}`, proxyError);
          // Throw the original error if available to keep context, or the proxy error
          throw new Error(`Download über Proxy fehlgeschlagen: ${fetchError?.message || 'Netzwerkfehler/CORS'}`);
      }
  }

  if (!response || !response.ok) {
      throw new Error(`Server antwortete mit Status ${response?.status || 'Unknown'}`);
  }

  // 3. Check Content-Length Header (if available) before downloading body
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Datei zu groß (${(parseInt(contentLength) / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`);
  }

  // 4. Download Blob and double check size
  const blob = await response.blob();
  if (blob.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Datei zu groß (${(blob.size / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`);
  }

  // 5. Convert to Base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = reader.result as string;
        // result is "data:application/pdf;base64,....."
        const base64 = result.split(',')[1];
        if (base64) resolve(base64);
        else reject(new Error("Fehler bei der Base64-Konvertierung"));
    };
    reader.onerror = () => reject(new Error("Fehler beim Lesen der Datei"));
    reader.readAsDataURL(blob);
  });
}

export async function askGemini(prompt: string, attachments: Attachment[] = []): Promise<string> {
  if (!process.env.API_KEY) {
    return "⚠️ **Konfigurationsfehler**: Kein API-Key gefunden. Bitte setzen Sie die Umgebungsvariable `API_KEY`.";
  }

  try {
    const parts: any[] = [{ text: prompt }];

    // Fetch attachments in parallel for speed, but handle failures individually
    // ensuring one failed file doesn't crash the whole request
    const attachmentPromises = attachments.map(async (file) => {
        if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
            try {
                const base64Data = await fetchFileAsBase64(file.url);
                return {
                    inlineData: {
                        mimeType: file.mimeType,
                        data: base64Data
                    }
                };
            } catch (e: any) {
                console.warn(`Skipping attachment ${file.url}: ${e.message}`);
                // Add a system note so the AI knows the file is missing and why
                return { text: `\n> *System-Hinweis: Der Anhang [${file.url.split('/').pop()}] konnte nicht verarbeitet werden. Grund: ${e.message}*` };
            }
        }
        return null;
    });

    const processedAttachments = (await Promise.all(attachmentPromises)).filter(Boolean);
    parts.push(...processedAttachments);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
    });

    return response.text || "Keine Antwort vom Modell erhalten.";

  } catch (error: any) {
    console.error("Gemini Request Error:", error);
    
    // User-friendly error mapping
    let userMessage = "Es ist ein unerwarteter Fehler aufgetreten.";
    
    if (error.message?.includes('403') || error.message?.includes('API key')) {
        userMessage = "Der API-Schlüssel ist ungültig oder hat keine Berechtigung.";
    } else if (error.message?.includes('429')) {
        userMessage = "Das Anfragelimit wurde erreicht (Quota Exceeded). Bitte versuchen Sie es später erneut.";
    } else if (error.message?.includes('500') || error.message?.includes('503')) {
        userMessage = "Der AI-Dienst ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.";
    } else if (error.message?.includes('fetch') || error.message?.includes('Download')) {
         userMessage = "Verbindungsfehler beim Abrufen der Dokumente. Möglicherweise blockiert der Server den Zugriff.";
    } else if (error.message?.includes('Datei zu groß')) {
         userMessage = "Ein oder mehrere Anhänge überschreiten das Limit von 10 MB.";
    }

    return `⚠️ **Fehler**: ${userMessage}\n\n*Technische Details: ${error.message}*`;
  }
}

export async function parseSearchQuery(query: string): Promise<StructuredSearch | null> {
    if (!process.env.API_KEY) return null;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Du bist ein Suchassistent für ein Ratsinformationssystem.
            Analysiere die folgende Suchanfrage des Benutzers und extrahiere strukturierte Daten für die Suche.
            Das heutige Datum ist ${new Date().toISOString().split('T')[0]}.
            
            Suchanfrage: "${query}"
            
            Extrahiere folgende Felder:
            1. resource: Wähle eins aus ['meetings', 'papers', 'people', 'organizations']. Wenn unsicher oder allgemein, wähle 'all'.
               - "Sitzungen", "Termine" -> 'meetings'
               - "Anträge", "Vorlagen", "Beschlüsse", "Dokumente" -> 'papers'
               - "Personen", "Politiker", "Mitglieder" -> 'people'
               - "Gremien", "Ausschüsse", "Fraktionen", "Parteien" -> 'organizations'
            2. q: Der eigentliche Suchbegriff (ohne Füllwörter).
            3. minDate: Startdatum im Format YYYY-MM-DD (falls ein Zeitraum genannt wurde).
            4. maxDate: Enddatum im Format YYYY-MM-DD (falls ein Zeitraum genannt wurde).
            
            Gib NUR das JSON zurück, ohne Markdown-Formatierung.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        resource: { type: Type.STRING, enum: ['meetings', 'papers', 'people', 'organizations', 'all'] },
                        q: { type: Type.STRING },
                        minDate: { type: Type.STRING },
                        maxDate: { type: Type.STRING }
                    },
                    required: ['resource']
                }
            }
        });

        const text = response.text;
        if (!text) return null;
        return JSON.parse(text) as StructuredSearch;
    } catch (e) {
        console.error("Failed to parse search query", e);
        return null;
    }
}
