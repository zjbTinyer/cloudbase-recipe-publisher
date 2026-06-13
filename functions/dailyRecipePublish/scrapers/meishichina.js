/**
 * 美食天下 (meishichina.com) 爬虫
 * 纯 regex/string 解析，无 cheerio 依赖
 */
const axios = require('axios');
const { withRetry } = require('../utils/retry');

const HOME_BASE = 'https://home.meishichina.com';
const LIST_URLS = [
  `${HOME_BASE}/recipe.html`,
  `${HOME_BASE}/recipe-menu.html`,
  `${HOME_BASE}/show-top-type-recipe.html`,
];

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
  for (const listUrl of LIST_URLS) {
    console.log(`[美食天下] 请求列表页: ${listUrl}`);
    try {
      const resp = await withRetry(() => axios.get(listUrl, { headers, timeout: 20000, responseType: 'text' }));
      const html = resp.data;
      const matches = html.match(/recipe-\d+\.html/g) || [];
      for (const m of matches) {
        if (['recipe-type', 'recipe-menu', 'recipe-list', 'show-top'].some(x => m.includes(x))) continue;
        const url = `${HOME_BASE}/${m}`;
        if (!seen.has(url)) { seen.add(url); urls.push(url); }
      }
      if (urls.length > 0) { console.log(`[美食天下] 找到 ${urls.length} 个食谱链接`); break; }
    } catch (e) { console.warn(`[美食天下] 列表页请求失败: ${e.message}`); }
  }
  return urls;
}

async function parseRecipeDetail(url) {
  console.log(`[美食天下] 解析详情: ${url}`);
  const resp = await withRetry(() => axios.get(url, { headers, timeout: 20000, responseType: 'text' }));
  const html = resp.data;

  // 标题
  const tMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = tMatch ? extractText(tMatch[1]) : '';
  if (!title) { console.warn('[美食天下] 未找到标题'); return null; }

  // 封面
  const cMatch = html.match(/<img[^>]+(?:data-src|src)="([^"]*?recipe[^"]*?)"/i)
    || html.match(/class="[^"]*recipe_cover[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/i);
  const coverUrl = cMatch ? cMatch[1] : '';

  // 食材: div.subtitle
  const ingredients = [];
  const subMatch = html.match(/<div[^>]+class="[^"]*subtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (subMatch) {
    const text = extractText(subMatch[1]);
    const pattern = /([^\d\s]+?)(\d+[颗个克gG升毫mMlL勺只条根片块]+|适量|少许)/g;
    let m;
    while ((m = pattern.exec(text))) ingredients.push([m[1].trim(), m[2].trim()]);
    if (ingredients.length > 0) console.log(`[美食天下] 从 subtitle 解析到 ${ingredients.length} 种食材`);
  }

  // 步骤: div.recipeStep_word
  const steps = [];
  const stepImages = [];
  const swRe = /<div[^>]+class="[^"]*recipeStep_word[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let swMatch;
  while ((swMatch = swRe.exec(html))) {
    const text = extractText(swMatch[1]);
    if (text && text.length > 3) steps.push(text);
    const iMatch = swMatch[1].match(/<img[^>]+(?:data-src|src)="([^"]+)"/i);
    if (iMatch && !iMatch[1].includes('blank')) stepImages.push(iMatch[1]);
  }

  if (!steps.length) { console.warn('[美食天下] 未找到步骤'); return null; }

  console.log(`[美食天下] 解析成功: ${title} (${ingredients.length}食材, ${steps.length}步骤)`);
  return { title, coverImageUrl: coverUrl, ingredients, steps, stepImages, sourceUrl: url, sourceName: '美食天下' };
}

async function getRandomRecipe() {
  const urls = await getRecipeList();
  if (!urls.length) { console.warn('[美食天下] 未获取到食谱列表'); return null; }
  console.log(`[美食天下] 获取到 ${urls.length} 个食谱链接`);
  const shuffled = urls.sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(shuffled.length, 10); i++) {
    try { const recipe = await parseRecipeDetail(shuffled[i]); if (recipe) return recipe; }
    catch (e) { console.warn(`[美食天下] 解析失败: ${e.message}`); }
  }
  return null;
}

module.exports = { getRandomRecipe, getRecipeList };
