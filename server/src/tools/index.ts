import { createExtractTodosTool } from './extractTodos';
import { createSummarizeTool } from './summarize';
import { createMakePlanTool } from './makePlan';

import type { ToolName, ToolDefinition } from './types';

const toolList: ToolDefinition[] = [
    createExtractTodosTool(),
    createSummarizeTool(),
    createMakePlanTool()
];

const toolMap = new Map<ToolName, ToolDefinition>(
    toolList.map((tool) => [tool.name, tool])
);

export const listTools = () => {
    return toolList;
};

export const getTool = (name: ToolName) => {
    return toolMap.get(name);
};

export const isToolName = (value: unknown): value is ToolName => {
    return typeof value === 'string' && toolMap.has(value as ToolName);
};