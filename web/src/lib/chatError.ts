import type { ChatDisplayError, ClientErrorCode, ServerErrorCode, SSEError } from "@/types/chat";


const SERVER_ERROR_TITLES: Record<ServerErrorCode, string> = {
  BAD_REQUEST: '请求内容有误',
  PROVIDER_ERROR: '模型服务异常',
  EMBEDDING_ERROR: '知识库服务异常',
  TOOL_ERROR: '工具执行异常',
  FIRST_TOKEN_TIMEOUT: '模型响应超时',
  OVERALL_TIMEOUT: '请求处理超时',
  INTERNAL_ERROR: '服务内部异常',
};

/**
 * 根据错误码 选择展示标题
 */
const getErrorTitle = (code: ClientErrorCode): string => {
  if (code.startsWith('HTTP_')) {
    return 'HTTP 请求失败';
  }

  switch (code) {
    case 'BAD_EVENT':
      return '响应解析失败';
    case 'NETWORK_ERROR':
      return '网络连接失败';
    case 'BAD_REQUEST':
    case 'PROVIDER_ERROR':
    case 'EMBEDDING_ERROR':
    case 'TOOL_ERROR':
    case 'FIRST_TOKEN_TIMEOUT':
    case 'OVERALL_TIMEOUT':
    case 'INTERNAL_ERROR':
      return SERVER_ERROR_TITLES[code];
    default:
      return '未知错误';
  };
};

/**
 * API/SSE 错误转换为 ErrorBanner 使用展示模型
 */
export const toChatDisplayError = (error: SSEError): ChatDisplayError => {
  return {
    code: error.code,
    title: getErrorTitle(error.code),
    message: error.message,
    requestId: error.requestId,
  }
};


/**
 * 将 fetch 或前端运行时捕获的未知异常  转换成安全、稳定的网络错误。
 */
export const toUnexpectedChatError = (_error: unknown): ChatDisplayError => {
  return {
    code: 'NETWORK_ERROR',
    title: '网络连接失败',
    message: '无法连接到服务，请检查网络或确认服务端已经启动',
  }
};
