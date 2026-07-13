
/**
 * 计算 2个向量的余弦相似度
 * 
 * 接近1 语义相似
 * 接近0 关联性弱
 * 接近-1 语义相反
 */
export const cosineSimilarity = (
    left: number[],
    right: number[]
): number => {
    if (left.length === 0 || left.length !== right.length) return 0;

    let dotProduct = 0;
    let leftLength = 0,
        rightLength = 0;

    for (let i = 0; i < left.length; i++) {
        dotProduct += left[i] * right[i];
        leftLength += left[i] ** 2;
        rightLength += right[i] ** 2;
    }

    const denominator = Math.sqrt(leftLength) * Math.sqrt(rightLength);

    if (denominator === 0) return 0;

    return dotProduct / denominator;
}