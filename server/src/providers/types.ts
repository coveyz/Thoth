// export type StreamInput = {
//     message: string;
// };

// export type ProviderStreamOptions = {
//     signal: AbortSignal;
// };




export type ProviderMessageRole = 'user' | 'assistant' | 'system';

export type ProviderMessage = {
    role: ProviderMessageRole;
    content: string;
};

export type ProviderResponseFormat =
    | { type: 'text' }
    | { type: 'json_object' };

export type ProviderGenerateInput = {
    messages: ProviderMessage[];
    responseFormat?: ProviderResponseFormat;
    temperature?: number
};

export type ProviderStreamInput = {
    messages: ProviderMessage[];
    temperature?: number
};

export type ProviderRequestOptions = {
    signal: AbortSignal;
};



export type Provider = {
    name: string;
    model: string;
    /** 非流式调用： 用于 "工具决策" "结构化输出" */
    generate(input: ProviderGenerateInput, options: ProviderRequestOptions): Promise<string>;
    // stream(input: StreamInput, options: ProviderStreamOptions): AsyncGenerator<string, void, void>;
    /** 流式调用： 用于最终回答 */
    stream(input: ProviderStreamInput, options: ProviderRequestOptions): AsyncGenerator<string, void, void>;
};
