
/** 提取 JSON 主体 */
export const extractJsonText = (input: string) => {
    const trimmed = input.trim();

    // 兼容 ```json ... ``` 这种格式
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    

    if (fenced?.[1]) {
        return fenced[1].trim();
    };

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    };

    return trimmed;
};

/** 安全解析 JSON */
export const parseModelJson = <T>(input: string): T | null => {
    const jsonText = extractJsonText(input);

    try {
        return JSON.parse(jsonText) as T;
    } catch (error) {
        return null;
    }
}

/** 格式化 JSON */
export const prettyJson = (value: unknown) => {
    return JSON.stringify(value, null, 2);
}