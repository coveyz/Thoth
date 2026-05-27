



export type ToolName = 'extract_todos' | 'summarize' | 'make_plan';

export type ToolInputProperty = {
    type: 'string' | 'number' | 'array' | 'boolean';
    description: string;
    items?: { type: 'string' | 'number' | 'boolean' };
};

export type ToolInputSchema = {
    type: 'object';
    properties: Record<string, ToolInputProperty>;
    required?: string[];
    additionalProperties?: boolean;
};

export type ToolExecutionContext = {
    requestId: string;
    now: string;
};

export type ToolExecutionSuccess = {
    ok: true;
    data: unknown;
};

export type ToolExecutionFailure = {
    ok: false;
    error: string;
};

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure;

export type ToolDefinition = {
    name: ToolName;
    description: string;
    inputSchema: ToolInputSchema;
    execute(
        args: Record<string, unknown>,
        context: ToolExecutionContext
    ): Promise<ToolExecutionResult>
};

export type ToolDecision = {
    mode: 'direct' | 'tool';
    reason: string;
    reply?: string;
    toolName?: ToolName;
    arguments?: Record<string, unknown>;
};