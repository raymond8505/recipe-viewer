// JSON-RPC 2.0 method names supported by the MCP server. Used as a const-object
// so call sites can compare against named members instead of string literals.
export const JsonRpcMethod = {
  INITIALIZE: "initialize",
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",
  NOTIFICATIONS_INITIALIZED: "notifications/initialized",
} as const;
export type JsonRpcMethod = (typeof JsonRpcMethod)[keyof typeof JsonRpcMethod];

// Standard JSON-RPC 2.0 error codes (https://www.jsonrpc.org/specification#error_object)
// plus the -32000..-32099 reserved server range we use for auth.
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32000,
} as const;
export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: { code: JsonRpcErrorCode; message: string; data?: unknown };
    };
