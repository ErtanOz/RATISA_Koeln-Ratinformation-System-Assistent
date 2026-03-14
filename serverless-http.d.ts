declare module 'serverless-http' {
  export interface ServerlessHttpRequest {
    headers?: Record<string, string | undefined>;
    body?: unknown;
    [key: string]: unknown;
  }

  export interface ServerlessHttpEvent {
    body?: unknown;
    headers?: Record<string, string | undefined>;
    path?: string;
    rawPath?: string;
    httpMethod?: string;
    version?: string;
    isBase64Encoded?: boolean;
    requestContext?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface ServerlessHttpOptions {
    basePath?: string;
    provider?: 'aws' | 'azure';
    requestId?: string;
    request?:
      | ((request: ServerlessHttpRequest, event: ServerlessHttpEvent, context: unknown) => unknown)
      | Record<string, unknown>;
    response?:
      | ((response: unknown, event: ServerlessHttpEvent, context: unknown) => unknown)
      | Record<string, unknown>;
  }

  export default function serverlessHttp(
    app: unknown,
    options?: ServerlessHttpOptions,
  ): (event: ServerlessHttpEvent, context: unknown) => Promise<unknown>;
}
