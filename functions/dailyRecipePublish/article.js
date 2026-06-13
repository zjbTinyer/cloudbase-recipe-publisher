/**
 * 文章 HTML 模板构建器
 * 将 Recipe 数据渲染为微信公众号兼容的富文本 HTML
 */

const COLOR_PRIMARY = '#c0392b';
const COLOR_BG_CARD = '#fafafa';
const COLOR_BG_INTRO = '#f8f8f8';
const COLOR_TEXT = '#333333';
const COLOR_TEXT_LIGHT = '#999999';
const COLOR_TABLE_HEADER = '#f5f5f5';
const MAX_CONTENT_LENGTH = 20000;

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 生成摘要
 */
function getSummary(recipe) {
  if (!recipe.steps || recipe.steps.length === 0) {
    return `今天为大家带来一道美味的${recipe.title}，简单易学，快来试试吧！`;
  }
  const text = recipe.steps.slice(0, 2).join('');
  const short = text.length > 100 ? text.substring(0, 97) + '...' : text;
  return `${recipe.title} — ${short}`;
}

/**
 * 根据食谱数据构建文章 HTML
 */
function buildArticleHtml(recipe, coverWxUrl = '', stepWxUrls = []) {
  const parts = [];

  // ─── 头部 ───
  parts.push('<div style="max-width:100%;overflow-x:hidden;">');

  // 封面图
  if (coverWxUrl) {
    parts.push(`
<div style="text-align:center;margin-bottom:20px;">
  <img src="${escapeHtml(coverWxUrl)}" style="width:100%;display:block;border-radius:8px;" alt="${escapeHtml(recipe.title)}">
</div>`);
  }

  // 菜名标题
  parts.push(`
<h1 style="font-size:22px;color:${COLOR_PRIMARY};text-align:center;margin:20px 0;font-weight:bold;">
  ${escapeHtml(recipe.title)}
</h1>`);

  // 引言
  parts.push(`
<section style="background:${COLOR_BG_INTRO};padding:15px;border-radius:8px;margin-bottom:20px;">
  <p style="font-size:15px;color:${COLOR_TEXT};line-height:1.8;margin:0;text-indent:2em;">
    ${escapeHtml(getSummary(recipe))}
  </p>
</section>`);

  // ─── 食材表 ───
  if (recipe.ingredients && recipe.ingredients.length > 0) {
    parts.push(`
<h2 style="font-size:18px;color:${COLOR_PRIMARY};border-left:4px solid ${COLOR_PRIMARY};padding-left:10px;margin:25px 0 15px;">
  📋 食材准备
</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
  <tr style="background:${COLOR_TABLE_HEADER};font-weight:bold;">
    <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${COLOR_TEXT};">食材</td>
    <td style="padding:10px 12px;border-bottom:1px solid #eee;color:${COLOR_TEXT};text-align:right;">用量</td>
  </tr>`);

    recipe.ingredients.forEach(([name, weight], i) => {
      const bg = i % 2 === 0 ? 'transparent' : '#fafafa';
      parts.push(`
  <tr style="background:${bg};">
    <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${escapeHtml(name)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#666;">${escapeHtml(weight)}</td>
  </tr>`);
    });

    parts.push('</table>');
  }

  // ─── 烹饪步骤 ───
  parts.push(`
<h2 style="font-size:18px;color:${COLOR_PRIMARY};border-left:4px solid ${COLOR_PRIMARY};padding-left:10px;margin:25px 0 15px;">
  🍳 烹饪步骤
</h2>`);

  recipe.steps.forEach((stepText, i) => {
    const stepNum = i + 1;
    parts.push(`
<div style="margin-bottom:20px;padding:15px;background:${COLOR_BG_CARD};border-radius:8px;">
  <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
    <span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;line-height:28px;background:${COLOR_PRIMARY};color:#fff;border-radius:50%;font-size:14px;font-weight:bold;margin-right:12px;flex-shrink:0;">${stepNum}</span>
    <span style="font-size:15px;color:${COLOR_TEXT};line-height:1.8;flex:1;">
      ${escapeHtml(stepText)}
    </span>
  </div>`);

    if (i < stepWxUrls.length && stepWxUrls[i]) {
      parts.push(`
  <img src="${escapeHtml(stepWxUrls[i])}" style="width:100%;margin-top:10px;border-radius:6px;display:block;" alt="步骤${stepNum}">`);
    }

    parts.push('</div>');
  });

  // ─── 小贴士 ───
  parts.push(`
<h2 style="font-size:18px;color:${COLOR_PRIMARY};border-left:4px solid ${COLOR_PRIMARY};padding-left:10px;margin:25px 0 15px;">
  💡 小贴士
</h2>
<section style="background:${COLOR_BG_INTRO};padding:15px;border-radius:8px;margin-bottom:20px;">
  <p style="font-size:14px;color:${COLOR_TEXT};line-height:1.8;margin:0;">
    1. 做菜前先把所有食材准备好，避免手忙脚乱。<br>
    2. 调味品的用量可以根据个人口味适量调整。<br>
    3. 如果喜欢，可以在最后撒上一些葱花或香菜提香。<br>
    4. 趁热食用口感最佳！
  </p>
</section>`);

  // ─── 页脚 ───
  parts.push(`
<hr style="border:none;border-top:1px solid #eee;margin:30px 0 15px;">
<p style="text-align:center;color:${COLOR_TEXT_LIGHT};font-size:13px;margin:10px 0;">
  本文由「每日家常菜」自动整理
</p>`);

  if (recipe.sourceUrl) {
    parts.push(`
<p style="text-align:center;color:${COLOR_TEXT_LIGHT};font-size:12px;margin:5px 0;">
  食谱参考：<a href="${escapeHtml(recipe.sourceUrl)}" style="color:${COLOR_TEXT_LIGHT};text-decoration:none;">${escapeHtml(recipe.sourceName)}</a>
</p>`);
  }

  parts.push(`
<p style="text-align:center;color:${COLOR_TEXT_LIGHT};font-size:12px;margin:5px 0 20px;">
  每天一道家常菜，让餐桌更有温度 ❤️
</p>
</div>`);

  let html = parts.join('');

  if (html.length > MAX_CONTENT_LENGTH) {
    console.log(`文章 HTML 长度 ${html.length} 超过限制 ${MAX_CONTENT_LENGTH}，进行截断`);
    html = html.substring(0, MAX_CONTENT_LENGTH - 200) + `
<p style="text-align:center;color:${COLOR_TEXT_LIGHT};font-size:12px;">（内容有删减）</p>
</div>`;
  }

  return html;
}

/**
 * 构建草稿请求体
 */
function buildDraftPayload(recipe, htmlContent, thumbMediaId, authorName = '每日家常菜') {
  let title = recipe.title || '';
  if (title.length > 64) title = title.substring(0, 61) + '...';

  let digest = getSummary(recipe);
  if (digest.length > 120) digest = digest.substring(0, 117) + '...';

  return {
    title,
    author: (authorName || '每日家常菜').substring(0, 8),
    digest,
    content: htmlContent,
    content_source_url: recipe.sourceUrl || '',
    thumb_media_id: thumbMediaId,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  };
}

module.exports = { buildArticleHtml, buildDraftPayload, getSummary };
