export type Role = 'user' | 'assistant';
export type ChatMessage = { id: string; role: Role; content: string; };

export type SSEEventName = 'start' | 'delta' | 'ping' | 'done' | 'error' |
  'sources' |
  'tool_call' |
  'tool_result' |
  'tool_error';

export type SSEStart = { requestId: string; model: string; };
export type SSEPing = { t: number; };
export type SSEDone = { ok: true; reason?: 'stop' };

/**
 * 与 Server的 AppErrorCode 保持一致
 */
export type ServerErrorCode =
  | "BAD_REQUEST"
  | "PROVIDER_ERROR"
  | "EMBEDDING_ERROR"
  | "TOOL_ERROR"
  | "FIRST_TOKEN_TIMEOUT"
  | "OVERALL_TIMEOUT"
  | "INTERNAL_ERROR"

/**
 * BAD_EVENT: 收到无法解析的 SSE data
 * NETWORK_ERROR： fetch本身失败，例如 Server 未启动或网络断开
 * HTTP_${number}： Server 在建立 SSE 前返回非 2xx HTTP 状态。
 */
export type ClientErrorCode =
  | ServerErrorCode
  | 'BAD_EVENT'
  | 'NETWORK_ERROR'
  | `HTTP_${number}`

/**
 * SSE 或 API 层传递的标准错误
 */
export type SSEError = {
  code: ClientErrorCode;
  message: string;
  requestId?: string;
};

/**
 * ErrorBanner 使用的展示模型
 * 它与 SSEError 分开定义，因为 title 是 UI 概念
 */
export type ChatDisplayError = {
  code: ClientErrorCode;
  title: string;
  message: string;
  requestId?: string;
};

/** 模型决定要调用工具时，server 会把这条事件推给前端 */
export type SSEToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
  reason: string;
}

/** 工具执行成功后的事件， result保留unknown 前端优先按原样展示 */
export type SSEToolResult = {
  name: ToolName;
  ok: true;
  result: unknown;
}
/** 工具执行失败后的事件, 和 chat Error 不是一回事 单独建模 */
export type SSEToolError = {
  name?: ToolName;
  message: string;
}




export type ToolName = 'extract_todos' | 'summarize' | 'make_plan';
export type ToolChoice = 'auto' | 'none' | ToolName;

/** 聊天整体状态 沿用 week1 */
export type ChatStatus = 'idle' | 'streaming' | 'stopping' | 'error';
/** 聊天每轮的结果状态, OutCome 只描述本轮请求结果，不描述整段历史 */
export type ChatTurnOutCome = 'pending' | 'done' | 'stopped' | 'error';
/** 工具轨迹事件，只放工具过程， 不放正文 */
export type ToolTimeLineEvent =
  | {
    id: string;
    type: 'tool_call';
    createdAt: number;
    payload: SSEToolCall;
  }
  | {
    id: string;
    type: 'tool_result';
    createdAt: number;
    payload: SSEToolResult;
  }
  | {
    id: string;
    type: 'tool_error';
    createdAt: number;
    payload: SSEToolError;
  }
/**
 * 一轮请求的 trace
 * 本轮用户输入和工具过程绑定，便于后面做历史轮次回看，不污染消息内容
*/
export type ChatTurnTrace = {
  id: string;
  userText: string;
  toolChoice: ToolChoice;
  createdAt: number;
  requestId?: string;
  model?: string;
  outcome: ChatTurnOutCome;
  doneReason?: SSEDone['reason'];

  error?: ChatDisplayError;

  events: ToolTimeLineEvent[];
  rag: boolean;
  sources: RagSource[];
};




export type RagSource = {
  id: string;
  documentId: string;
  title: string;
  source: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type SSERagSource = {
  sources: RagSource[];
};
