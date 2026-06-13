/**
 * 配置管理模块
 * 从云函数环境变量读取配置
 */

module.exports = {
  // 微信公众号凭证（在 CloudBase 控制台 → 云函数 → 环境变量 中配置）
  wechatAppId: process.env.WECHAT_APP_ID || '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET || '',

  // 爬虫配置
  primaryScraper: process.env.PRIMARY_SCRAPER || 'douguo',
  recipeCategory: process.env.RECIPE_CATEGORY || '家常菜',

  // 公众号文章作者名
  authorName: process.env.AUTHOR_NAME || '每日家常菜',

  // 日志级别
  logLevel: process.env.LOG_LEVEL || 'INFO',
};
