/**
 * 重试工具
 * 指数退避 + 随机抖动
 */

/**
 * 异步函数重试装饰器
 * @param {Function} fn - 异步函数
 * @param {number} maxAttempts - 最大尝试次数
 * @param {number} baseDelay - 基础延迟(ms)
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxAttempts = 3, baseDelay = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random());
        console.log(`第 ${attempt}/${maxAttempts} 次失败: ${e.message}. ${(delay/1000).toFixed(1)}s 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
