/**
 * 美食天下 (meishichina.com) 爬虫
 * 作为豆果美食的备选源
 *
 * 页面结构确认 (从GitHub Actions诊断):
 * - 列表: a[href*="recipe-"] (在 recipe.html 中)
 * - 步骤: div.recipeStep_word
 * - 食材: div.subtitle
 * - 标题: h1
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { withRetry } = require('../utils/retry');

const HOME_BASE = 'https://home.meishichina.com';

const LIST_URLS = [
  `${HOME_BASE}/recipe.html`,
  `${HOME_BASE}/recipe-menu.html`,
  `${HOME_BASE}/show-top-type-recipe.html`,
];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/**
 * 从列表页获取食谱URL列表
 */
async function getRecipeList() {
  const urls = [];

  for (const listUrl of LIST_URLS) {
    console.log(`[美食天下] 请求列表页: ${listUrl}`);
    try {
      const resp = await withRetry(() => axios.get(listUrl, {
        headers,
        timeout: 20000,
        responseEncoding: 'utf8',
      }));
      const $ = cheerio.load(resp.data);

      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('recipe-') && href.endsWith('.html')) {
          // 过滤掉分类/列表页
          if (['recipe-type', 'recipe-menu', 'recipe-list', 'show-top'].some(x => href.includes(x))) {
            return;
          }
          const fullUrl = href.startsWith('http') ? href : `${HOME_BASE}${href}`;
          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      });

      if (urls.length > 0) {
        console.log(`[美食天下] 找到 ${urls.length} 个食谱链接`);
        break;
      }
    } catch (e) {
      console.warn(`[美食天下] 列表页请求失败: ${e.message}`);
      continue;
    }
  }

  return urls;
}

/**
 * 解析食谱详情页
 */
async function parseRecipeDetail(url) {
  console.log(`[美食天下] 解析详情: ${url}`);

  const resp = await withRetry(() => axios.get(url, {
    headers,
    timeout: 20000,
    responseEncoding: 'utf8',
  }));
  const $ = cheerio.load(resp.data);

  // 标题
  const title = $('h1').first().text().trim();
  if (!title) {
    console.warn('[美食天下] 未找到标题');
    return null;
  }

  // 封面图
  let coverUrl = '';
  for (const sel of ['div.recipe_cover img', 'div.detail img', 'div.recipe-show img']) {
    const img = $(sel).first();
    if (img.length) {
      coverUrl = img.attr('data-src') || img.attr('src') || '';
      if (coverUrl && !coverUrl.includes('logo')) break;
    }
  }

  // 食材: div.subtitle
  const ingredients = [];
  const subtitle = $('div.subtitle').first();
  if (subtitle.length) {
    const text = subtitle.text().trim();
    // 正则匹配"名称+数量"模式
    const pattern = /([^\d\s]+?)(\d+[颗个克gG升毫mMlL勺只条根片块]+|适量|少许)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      ingredients.push([match[1].trim(), match[2].trim()]);
    }
    if (ingredients.length > 0) {
      console.log(`[美食天下] 从 subtitle 解析到 ${ingredients.length} 种食材`);
    }
  }

  // 步骤: div.recipeStep_word (从诊断确认)
  const steps = [];
  const stepImages = [];
  const stepWords = $('div.recipeStep_word');
  if (stepWords.length > 0) {
    console.log(`[美食天下] 步骤选择器匹配: div.recipeStep_word (${stepWords.length} 项)`);
    stepWords.each((i, sw) => {
      const text = $(sw).text().trim();
      if (text && text.length > 3) {
        steps.push(text);
      }
      const img = $(sw).find('img').first();
      if (img.length) {
        const src = img.attr('data-src') || img.attr('src') || '';
        if (src && !src.includes('blank')) {
          stepImages.push(src);
        }
      }
    });
  }

  if (steps.length === 0) {
    console.warn('[美食天下] 未找到步骤');
    return null;
  }

  console.log(`[美食天下] 解析成功: ${title} (${ingredients.length}食材, ${steps.length}步骤, ${stepImages.length}图片)`);

  return {
    title,
    coverImageUrl: coverUrl,
    ingredients,
    steps,
    stepImages,
    sourceUrl: url,
    sourceName: '美食天下',
  };
}

/**
 * 随机获取一个食谱
 */
async function getRandomRecipe() {
  const urls = await getRecipeList();
  if (urls.length === 0) {
    console.warn('[美食天下] 未获取到食谱列表');
    return null;
  }

  console.log(`[美食天下] 获取到 ${urls.length} 个食谱链接`);

  const shuffled = urls.sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(shuffled.length, 10); i++) {
    try {
      const recipe = await parseRecipeDetail(shuffled[i]);
      if (recipe && recipe.title && recipe.steps.length > 0) {
        return recipe;
      }
    } catch (e) {
      console.warn(`[美食天下] 解析详情失败 ${shuffled[i]}: ${e.message}`);
      continue;
    }
  }

  return null;
}

module.exports = { getRandomRecipe, getRecipeList };
