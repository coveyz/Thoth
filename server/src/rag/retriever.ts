import { ragDocuments } from './document';
import type { RagSearchResult, RagSource } from './types';

/**
 * 阶段1: 简单的基于文本包含的检索， 英文按照单词切，中文暴力命中，过滤最短
 */
const tokenize = (text: string): string[] => {
    return text.toLocaleLowerCase()
        .split(/[\s,，。.!！？?、:：;；()[\]{}"'`]+/)
        .map(word => word.trim())
        .filter(word => word.length >= 2);
}

/** 计算文档片段和用户问题的相关分数 */
const scoreDocument = (query: string, sourceText: string): number => {
    const normalizedQuery = query.toLocaleLowerCase().trim();
    const normalizedSource = sourceText.toLocaleLowerCase();
    const tokens = tokenize(normalizedQuery);
    
    let source = 0;

    for (const token of tokens) {
        if (normalizedSource.includes(token)) {
            source += 1;
        };
    };

    if (normalizedQuery && normalizedSource.includes(normalizedQuery)) {
        source += 2;
    }

    return source;
}

/** 检索 TopK文档片段 */
export const retrieveSources = (query: string, topK = 3): RagSearchResult => {
    const scoredSources: RagSource[] = ragDocuments.map(doc => {
        const searchableText = [
            doc.title,
            doc.source,
            doc.content
        ].join('\n');

        return {
            ...doc,
            score: scoreDocument(query, searchableText)
        }
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);


    return {
        sources: scoredSources
    }
}