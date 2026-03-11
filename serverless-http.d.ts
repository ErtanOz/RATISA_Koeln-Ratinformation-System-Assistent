declare module 'serverless-http' {
  export default function serverlessHttp(
    app: unknown,
  ): (event: unknown, context: unknown) => Promise<unknown>;
}
