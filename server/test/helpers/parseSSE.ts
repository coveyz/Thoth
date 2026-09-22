
/**
 * 测试代码使用的 SSE 事件结构。
 *
 * name 对应：
 * event: start
 *
 * data 对应：
 * data: {"requestId":"abcd","model":"fake-model"}
 */
export type ParsedSSEEvent = {
    name: string;
    data: string;
};

/**
 * 将完整 SSE 响应文本解析成事件数组。
 * SSE 事件之间使用一个空行分隔：
 *
 * event: start
 * data: {...}
 *
 * event: delta
 * data: 你好
 *
 * 因此第一步先按照空行拆分 event block，
 * 再从每个 block 中读取 event 和 data 行。
 */
export function parseSSE(text: string): ParsedSSEEvent[] {
    return text
        .split(/\r?\n\r?\n/)
        .map(block => {
            const lines = block.split(/\r?\n/);
            /** 一个标准事件块中应当有一行 event: */
            const eventLine = lines.find(line => line.startsWith('event:'));

            /**
            * data 理论上可以有多行，因此这里收集全部 data: 行。！
            *
            * slice(5) 移除 "data:"；
            * trimStart() 只删除开头空格，不破坏正文末尾空格。
            */
            const data = lines
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n');

            if (!eventLine) {
                return null;
            };

            return {
                name: eventLine.slice(6).trimStart(),
                data
            };
        })
        .filter((event): event is ParsedSSEEvent => event !== null);
};

/**
 * 解析事件中的 JSON data。
 */
export function parseSSEJson<T>(event: ParsedSSEEvent): T {
    return JSON.parse(event.data) as T;
}