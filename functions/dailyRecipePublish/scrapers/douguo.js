/**
 * 豆果美食 (douguo.com) 爬虫
 * 纯 regex/string 解析，无 cheerio 依赖
 */
const axios = require('axios');
const { withRetry } = require('../utils/retry');

const BASE_URL = 'https://www.douguo.com';
const LIST_URLS = ['/jingxuan/0'];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

function extractText(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function getRecipeList() {
  const urls = [];
  const seen = new Set();
  for (const listPath of LIST_URLS) {
    try {
      const resp = await withRetry(() => axios.get(`${BASE_URL}${listPath}`, { headers, timeout: 20000 }));
      const matches = resp.data.match(/\/cookbook\/\d+\.html/g) || [];
      for (const m of matches) {
        const url = `${BASE_URL}${m}`;
        if (!seen.has(url)) { seen.add(url); urls.push(url); }
      }
      if (urls.length > 0) break;
    } catch (e) { console.warn(`[豆果美食] 列表页请求失败: ${e.message}`); }
  }
  return urls;
}

async function parseRecipeDetail(url) {
  console.log(`[豆果美食] 解析详情: ${url}`);
  const resp = await withRetry(() => axios.get(url, { headers, timeout: 20000 }));
  const html = resp.data;

  // 标题
  const tMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = tMatch ? extractText(tMatch[1]) : '';
  if (!title) { console.warn('[豆果美食] 未找到标题'); return null; }

  // 封面
  const cMatch = html.match(/id="banner"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)
    || html.match(/class="[^"]*recipe-cover[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
  const coverUrl = cMatch ? cMatch[1] : '';

  // 食材: div.metarial 中提取 span.scname + span.scnum
  const ingredients = [];
  const mtMatch = html.match(/<div[^>]+class="[^"]*metarial[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*step)/i);
  if (mtMatch) {
    const names = [];
    const nums = [];
    const nRe = /<span[^>]+class="[^"]*scname[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    const uRe = /<span[^>]+class="[^"]*scnum[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    let m;
    while ((m = nRe.exec(mtMatch[1]))) names.push(extractText(m[1]));
    while ((m = uRe.exec(mtMatch[1]))) nums.push(extractText(m[1]));
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (name && !['配方', '做法', '步骤'].some(kw => name.includes(kw))) {
        ingredients.push([name, i < nums.length ? nums[i] : '适量']);
      }
    }
  }

  // 步骤: div.stepcont > div.stepinfo
  const steps = [];
  const stepImages = [];
  const siRe = /<div[^>]+class="[^"]*stepinfo[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  const imgRe = /<img[^>]+src="([^"]+)"/gi;
  let siMatch;
  while ((siMatch = siRe.exec(html))) {
    let text = extractText(siMatch[1]).replace(/^步骤\d+/, '').trim();
    if (text && text.length > 3) steps.push(text);
  }
  let imgMatch;
  while ((imgMatch = imgRe.exec(html))) {
    const src = imgMatch[1];
    // 只保留菜谱步骤图，过滤 logo/qrcode/banner/static/avatar
    if (src && src.includes('/upload/caiku/') && !src.includes('/static/') && !src.includes('/banner/')) {
      stepImages.push(src);
    }
  }

  if (!steps.length) { console.warn('[豆果美食] 未找到步骤'); return null; }

  console.log(`[豆果美食] 解析成功: ${title} (${ingredients.length}食材, ${steps.length}步骤)`);
  return { title, coverImageUrl: coverUrl, ingredients, steps, stepImages, sourceUrl: url, sourceName: '豆果美食' };
}

async function getRandomRecipe() {
  const urls = await getRecipeList();
  if (!urls.length) { console.warn('[豆果美食] 未获取到食谱列表'); return null; }
  console.log(`[豆果美食] 获取到 ${urls.length} 个食谱链接`);
  const shuffled = urls.sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(shuffled.length, 10); i++) {
    try { const recipe = await parseRecipeDetail(shuffled[i]); if (recipe) return recipe; }
    catch (e) { console.warn(`[豆果美食] 解析失败: ${e.message}`); }
  }
  return null;
}

module.exports = { getRandomRecipe, getRecipeList };
