/**
 * 豆果美食 (douguo.com) 爬虫
 * 从中国IP可正常访问，无403拦截
 *
 * 页面结构确认 (2026.06):
 * - 列表: ul#jxlist li a → /cookbook/{id}.html
 * - 标题: h1
 * - 封面: #banner img
 * - 食材: div.metarial tr → span.scname + span.scnum
 * - 步骤: div.stepcont → div.stepinfo (文字) + img (图片)
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { withRetry } = require('../utils/retry');

const BASE_URL = 'https://www.douguo.com';
const LIST_URLS = ['/jingxuan/0'];

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

  for (const listPath of LIST_URLS) {
    const listUrl = `${BASE_URL}${listPath}`;
    console.log(`[豆果美食] 请求列表页: ${listUrl}`);

    try {
      const resp = await withRetry(() => axios.get(listUrl, { headers, timeout: 20000 }));
      const $ = cheerio.load(resp.data);

      $('ul#jxlist li a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/cookbook/') && href.endsWith('.html')) {
          const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      });

      if (urls.length > 0) break;
    } catch (e) {
      console.warn(`[豆果美食] 列表页请求失败: ${e.message}`);
      continue;
    }
  }

  return urls;
}

/**
 * 解析食谱详情页
 */
async function parseRecipeDetail(url) {
  console.log(`[豆果美食] 解析详情: ${url}`);

  const resp = await withRetry(() => axios.get(url, { headers, timeout: 20000 }));
  const $ = cheerio.load(resp.data);

  // 标题
  const title = $('h1').first().text().trim();
  if (!title) {
    console.warn('[豆果美食] 未找到标题');
    return null;
  }

  // 封面图
  let coverUrl = '';
  const coverImg = $('#banner img').first();
  if (coverImg.length) {
    coverUrl = coverImg.attr('src') || coverImg.attr('data-src') || '';
  }

  // 食材: div.metarial 中的 span.scname + span.scnum
  const ingredients = [];
  const metarial = $('div.metarial');
  if (metarial.length) {
    metarial.find('tr').each((i, tr) => {
      const names = $(tr).find('span.scname');
      const nums = $(tr).find('span.scnum');
      names.each((j, nameEl) => {
        const name = $(nameEl).text().trim();
        if (name && !['配方', '做法', '步骤'].some(kw => name.includes(kw))) {
          const weight = j < nums.length ? $(nums[j]).text().trim() : '适量';
          ingredients.push([name, weight]);
        }
      });
    });
  }

  // 步骤: div.stepcont → div.stepinfo (文字) + img (图片)
  const steps = [];
  const stepImages = [];

  $('div.stepcont').each((i, cont) => {
    const stepinfo = $(cont).find('div.stepinfo').first();
    if (stepinfo.length) {
      let text = stepinfo.text().trim();
      // 去除开头的"步骤N"前缀
      text = text.replace(/^步骤\d+/, '').trim();
      if (text) steps.push(text);
    }
    const img = $(cont).find('img').first();
    if (img.length) {
      const src = img.attr('src') || img.attr('data-src') || '';
      if (src) stepImages.push(src);
    }
  });

  if (steps.length === 0) {
    console.warn('[豆果美食] 未找到步骤');
    return null;
  }

  console.log(`[豆果美食] 解析成功: ${title} (${ingredients.length}食材, ${steps.length}步骤, ${stepImages.length}图片)`);

  return {
    title,
    coverImageUrl: coverUrl,
    ingredients,
    steps,
    stepImages,
    sourceUrl: url,
    sourceName: '豆果美食',
  };
}

/**
 * 随机获取一个食谱
 */
async function getRandomRecipe() {
  const urls = await getRecipeList();
  if (urls.length === 0) {
    console.warn('[豆果美食] 未获取到食谱列表');
    return null;
  }

  console.log(`[豆果美食] 获取到 ${urls.length} 个食谱链接`);

  // 随机打乱，逐个尝试直到成功解析
  const shuffled = urls.sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(shuffled.length, 10); i++) {
    try {
      const recipe = await parseRecipeDetail(shuffled[i]);
      if (recipe && recipe.title && recipe.steps.length > 0) {
        return recipe;
      }
    } catch (e) {
      console.warn(`[豆果美食] 解析详情失败 ${shuffled[i]}: ${e.message}`);
      continue;
    }
  }

  return null;
}

module.exports = { getRandomRecipe, getRecipeList };
