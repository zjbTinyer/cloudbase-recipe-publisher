/**
 * 每日家常菜公众号自动发布 — CloudBase 云函数入口
 *
 * 流程: 爬虫抓取食谱 → 处理图片 → 构建文章 → 公众号发布
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const config = require('./config');
const { getRandomRecipe: douguoScrape } = require('./scrapers/douguo');
const { getRandomRecipe: meishichinaScrape } = require('./scrapers/meishichina');
const { WeChatClient } = require('./wechat/client');
const { buildArticleHtml, buildDraftPayload } = require('./article');

// 云函数临时目录
const TMP_DIR = '/tmp';

// 爬虫注册表
const SCRAPERS = {
  douguo: douguoScrape,
  meishichina: meishichinaScrape,
};

/**
 * 下载图片到 /tmp 目录
 */
async function downloadImage(url, prefix = 'img') {
  if (!url) return null;

  try {
    console.log(`下载图片: ${url.substring(0, 80)}...`);
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://www.douguo.com/',
      },
      responseType: 'stream',
      timeout: 20000,
    });

    const ext = path.extname(url).split('?')[0] || '.jpg';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const filepath = path.join(TMP_DIR, filename);

    const writer = fs.createWriteStream(filepath);
    resp.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const size = fs.statSync(filepath).size;
        if (size === 0) {
          try { fs.unlinkSync(filepath); } catch (_) {}
          resolve(null);
        } else {
          console.log(`图片已保存: ${filepath} (${size} bytes)`);
          resolve(filepath);
        }
      });
      writer.on('error', (e) => {
        try { fs.unlinkSync(filepath); } catch (_) {}
        reject(e);
      });
    });
  } catch (e) {
    console.error(`下载图片失败: ${e.message}`);
    return null;
  }
}

/**
 * 抓取食谱（按优先级回退）
 */
async function fetchRecipe() {
  const order = [config.primaryScraper].concat(
    Object.keys(SCRAPERS).filter(s => s !== config.primaryScraper)
  );

  for (const name of order) {
    const scraper = SCRAPERS[name];
    if (!scraper) continue;

    try {
      console.log(`尝试从 [${name}] 抓取食谱...`);
      const recipe = await scraper(config.recipeCategory);
      if (recipe && recipe.title && recipe.steps && recipe.steps.length > 0) {
        recipe.sourceName = recipe.sourceName || name;
        console.log(`[${name}] 抓取成功: ${recipe.title}`);
        return recipe;
      }
      console.warn(`[${name}] 返回数据不完整，回退`);
    } catch (e) {
      console.error(`[${name}] 抓取失败: ${e.message}`);
    }
  }

  throw new Error(`所有爬虫源都失败了，尝试过: ${order}`);
}

/**
 * 云函数主入口
 */
exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('='.repeat(50));
  console.log('每日家常菜公众号自动发布 - CloudBase 云函数');
  console.log('='.repeat(50));
  console.log(`配置: 首选爬虫=${config.primaryScraper}`);

  try {
    // ── 1. 校验凭证 ──
    if (!config.wechatAppId || !config.wechatAppSecret) {
      throw new Error('WECHAT_APP_ID 和 WECHAT_APP_SECRET 未配置');
    }

    // ── 2. 抓取食谱 ──
    console.log('>>> 第1步: 抓取食谱');
    const recipe = await fetchRecipe();
    console.log(`食谱: ${recipe.title}`);
    console.log(`来源: ${recipe.sourceName} (${recipe.sourceUrl})`);
    console.log(`食材: ${recipe.ingredients.length} 种`);
    console.log(`步骤: ${recipe.steps.length} 步`);
    console.log(`步骤图片: ${recipe.stepImages.length} 张`);

    // ── 3. 初始化微信客户端 ──
    console.log('>>> 第2步: 连接微信公众号');
    const wechat = new WeChatClient(config.wechatAppId, config.wechatAppSecret);
    await wechat.getAccessToken();
    console.log('微信 access_token 获取成功');

    // ── 4. 处理封面图 ──
    console.log('>>> 第3步: 处理图片');
    let thumbMediaId = '';
    if (recipe.coverImageUrl) {
      console.log('处理封面图...');
      const coverPath = await downloadImage(recipe.coverImageUrl, 'cover');
      if (coverPath) {
        try {
          thumbMediaId = await wechat.uploadPermanentImage(coverPath);
          console.log(`封面图 media_id: ${thumbMediaId}`);
        } catch (e) {
          console.error(`上传封面图失败: ${e.message}`);
        } finally {
          try { fs.unlinkSync(coverPath); } catch (_) {}
        }
      }
    }

    // ── 5. 处理正文图片 ──
    const stepWxUrls = [];
    for (const imgUrl of recipe.stepImages || []) {
      if (!imgUrl) {
        stepWxUrls.push('');
        continue;
      }
      const localPath = await downloadImage(imgUrl, 'step');
      if (!localPath) {
        stepWxUrls.push('');
        continue;
      }
      try {
        const wxUrl = await wechat.uploadContentImage(localPath);
        stepWxUrls.push(wxUrl);
      } catch (e) {
        console.error(`上传正文图片失败: ${e.message}`);
        stepWxUrls.push('');
      } finally {
        try { fs.unlinkSync(localPath); } catch (_) {}
      }
    }

    const successCount = stepWxUrls.filter(Boolean).length;
    console.log(`步骤图片上传成功: ${successCount}/${recipe.stepImages.length}`);

    // 封面图作为正文展示用图
    let coverWxUrl = '';
    if (recipe.coverImageUrl) {
      const coverPath = await downloadImage(recipe.coverImageUrl, 'cover_content');
      if (coverPath) {
        try {
          coverWxUrl = await wechat.uploadContentImage(coverPath);
        } catch (e) {
          console.error(`上传封面内容图失败: ${e.message}`);
        } finally {
          try { fs.unlinkSync(coverPath); } catch (_) {}
        }
      }
    }

    // ── 6. 构建文章 HTML ──
    console.log('>>> 第4步: 构建文章 HTML');
    const htmlContent = buildArticleHtml(recipe, coverWxUrl, stepWxUrls);
    console.log(`文章 HTML 长度: ${htmlContent.length} 字符`);

    // ── 7. 创建草稿 ──
    console.log('>>> 第5步: 创建草稿');
    const draftPayload = buildDraftPayload(
      recipe, htmlContent, thumbMediaId,
      config.authorName
    );
    console.log(`草稿标题: ${draftPayload.title}`);
    console.log(`草稿摘要: ${draftPayload.digest.substring(0, 60)}...`);

    const draftMediaId = await wechat.addDraft(draftPayload);

    // ── 8. 提交发布 ──
    console.log('>>> 第6步: 提交发布');
    const publishId = await wechat.publish(draftMediaId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('='.repeat(50));
    console.log(`✅ 发布成功！`);
    console.log(`   菜名: ${recipe.title}`);
    console.log(`   来源: ${recipe.sourceName}`);
    console.log(`   原文: ${recipe.sourceUrl}`);
    console.log(`   publish_id: ${publishId}`);
    console.log(`   耗时: ${elapsed}s`);
    console.log('='.repeat(50));

    return {
      success: true,
      title: recipe.title,
      source: recipe.sourceName,
      publishId,
      elapsed: `${elapsed}s`,
    };

  } catch (e) {
    console.error('='.repeat(50));
    console.error(`❌ 运行失败: ${e.message}`);
    console.error(e.stack);
    console.error('='.repeat(50));

    return {
      success: false,
      error: e.message,
    };
  }
};
