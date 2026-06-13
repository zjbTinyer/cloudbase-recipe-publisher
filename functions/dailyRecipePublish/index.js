/**
 * 每日家常菜公众号自动发布 — CloudBase 云函数
 * 流程: 抓取食谱 → 处理图片 → 构建文章 → 发布
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { getRandomRecipe: douguoScrape } = require('./scrapers/douguo');
const { getRandomRecipe: meishichinaScrape } = require('./scrapers/meishichina');
const { WeChatClient } = require('./wechat/client');
const { buildArticleHtml, buildDraftPayload } = require('./article');

const TMP = '/tmp';
const SCRAPERS = { douguo: douguoScrape, meishichina: meishichinaScrape };

async function downloadImage(url, prefix = 'img') {
  if (!url) return null;
  try {
    console.log(`下载图片: ${url.substring(0, 80)}...`);
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.douguo.com/' },
      responseType: 'stream', timeout: 20000,
    });
    const ext = (path.extname(url) || '.jpg').split('?')[0];
    const fp = path.join(TMP, `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
    const writer = fs.createWriteStream(fp);
    resp.data.pipe(writer);
    return new Promise((resolve) => {
      writer.on('finish', () => {
        const size = fs.statSync(fp).size;
        if (!size) { try { fs.unlinkSync(fp); } catch (_) {} resolve(null); }
        else resolve(fp);
      });
      writer.on('error', () => resolve(null));
    });
  } catch (e) { console.error(`下载图片失败: ${e.message}`); return null; }
}

async function fetchRecipe() {
  const order = [config.primaryScraper].concat(Object.keys(SCRAPERS).filter(s => s !== config.primaryScraper));
  for (const name of order) {
    const scraper = SCRAPERS[name];
    if (!scraper) continue;
    try {
      console.log(`尝试从 [${name}] 抓取...`);
      const recipe = await scraper(config.recipeCategory);
      if (recipe && recipe.title && recipe.steps && recipe.steps.length > 0) {
        recipe.sourceName = recipe.sourceName || name;
        console.log(`[${name}] 抓取成功: ${recipe.title}`);
        return recipe;
      }
    } catch (e) { console.error(`[${name}] 失败: ${e.message}`); }
  }
  throw new Error('所有爬虫源失败');
}

exports.main = async (event, context) => {
  const start = Date.now();
  console.log('='.repeat(50));
  console.log('每日家常菜 - CloudBase 云函数');
  console.log('='.repeat(50));

  try {
    if (!config.wechatAppId || !config.wechatAppSecret) throw new Error('环境变量未配置');

    // 1. 抓取食谱
    console.log('>>> 第1步: 抓取食谱');
    const recipe = await fetchRecipe();
    console.log(`食谱: ${recipe.title} | ${recipe.ingredients.length}食材 ${recipe.steps.length}步骤 ${recipe.stepImages.length}图`);

    // 2. 微信客户端
    console.log('>>> 第2步: 连接微信');
    const wechat = new WeChatClient(config.wechatAppId, config.wechatAppSecret);
    await wechat.getAccessToken();

    // 3. 封面图
    console.log('>>> 第3步: 处理图片');
    let thumbMediaId = '';
    if (recipe.coverImageUrl) {
      const cp = await downloadImage(recipe.coverImageUrl, 'cover');
      if (cp) {
        try { thumbMediaId = await wechat.uploadPermanentImage(cp); console.log(`封面 media_id: ${thumbMediaId}`); }
        catch (e) { console.error(`封面上传失败: ${e.message}`); }
        try { fs.unlinkSync(cp); } catch (_) {}
      }
    }

    // 4. 步骤图片
    const wxUrls = [];
    for (const u of recipe.stepImages || []) {
      if (!u) { wxUrls.push(''); continue; }
      const lp = await downloadImage(u, 'step');
      if (!lp) { wxUrls.push(''); continue; }
      try { wxUrls.push(await wechat.uploadContentImage(lp)); }
      catch (e) { console.error(`步骤图片上传失败: ${e.message}`); wxUrls.push(''); }
      try { fs.unlinkSync(lp); } catch (_) {}
    }
    console.log(`步骤图片: ${wxUrls.filter(Boolean).length}/${recipe.stepImages.length}`);

    // 5. 正文封面
    let coverWxUrl = '';
    if (recipe.coverImageUrl) {
      const cp = await downloadImage(recipe.coverImageUrl, 'cover_ct');
      if (cp) { try { coverWxUrl = await wechat.uploadContentImage(cp); } catch (_) {} try { fs.unlinkSync(cp); } catch (_) {} }
    }

    // 6. 构建文章
    console.log('>>> 第4步: 构建文章');
    const html = buildArticleHtml(recipe, coverWxUrl, wxUrls);
    console.log(`HTML: ${html.length} 字符`);

    // 7. 创建草稿
    console.log('>>> 第5步: 创建草稿');
    const payload = buildDraftPayload(recipe, html, thumbMediaId, config.authorName);
    const draftId = await wechat.addDraft(payload);

    // 8. 发布（认证前可能因48001失败，不影响草稿）
    console.log('>>> 第6步: 提交发布');
    let publishId = '';
    let autoPublished = false;
    try {
      publishId = await wechat.publish(draftId);
      autoPublished = true;
    } catch (e) {
      if (e.message.includes('48001')) {
        console.warn('⚠️ 发布接口需要公众号认证（48001），草稿已生成，请手动发布');
      } else {
        throw e;
      }
    }

    console.log('='.repeat(50));
    if (autoPublished) {
      console.log(`✅ 发布成功！${recipe.title} | publish_id: ${publishId}`);
    } else {
      console.log(`✅ 草稿已生成！${recipe.title} | draft_media_id: ${draftId}`);
      console.log('📱 请前往 mp.weixin.qq.com → 草稿箱 → 手动发布');
    }
    console.log(`耗时: ${((Date.now()-start)/1000).toFixed(1)}s`);
    console.log('='.repeat(50));
    return { success: true, title: recipe.title, draftId, publishId, autoPublished };
  } catch (e) {
    console.error(`❌ 失败: ${e.message}`);
    return { success: false, error: e.message };
  }
};
