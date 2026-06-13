/**
 * 微信公众号 API 客户端
 * 封装: access_token 管理、素材上传、草稿创建、发布
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { withRetry } = require('../utils/retry');

const API_BASE = 'https://api.weixin.qq.com';

class WeChatClient {
  constructor(appId, appSecret) {
    this.appId = appId;
    this.appSecret = appSecret;
    this._accessToken = null;
    this._tokenExpiresAt = 0;
  }

  /**
   * 获取 access_token（自动缓存和刷新）
   */
  async getAccessToken() {
    if (this._accessToken && Date.now() < this._tokenExpiresAt - 300000) {
      return this._accessToken;
    }

    console.log('获取微信 access_token...');
    const url = `${API_BASE}/cgi-bin/token`;
    const resp = await axios.get(url, {
      params: {
        grant_type: 'client_credential',
        appid: this.appId,
        secret: this.appSecret,
      },
      timeout: 10000,
    });

    const data = resp.data;
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`获取 access_token 失败: errcode=${data.errcode}, errmsg=${data.errmsg}`);
    }

    this._accessToken = data.access_token;
    this._tokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000;
    console.log(`access_token 获取成功，有效期 ${data.expires_in}s`);
    return this._accessToken;
  }

  /**
   * 上传永久图片素材（用于文章封面）
   */
  async uploadPermanentImage(imagePath) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/cgi-bin/material/add_material`;

    console.log(`上传永久图片素材: ${imagePath}`);

    // 使用 Node 18 内置 FormData + Blob
    const fileBuffer = await fs.promises.readFile(imagePath);
    const blob = new Blob([fileBuffer]);
    const fileName = path.basename(imagePath);
    const formData = new FormData();
    formData.append('media', blob, fileName);

    const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;
    // axios 支持直接传 FormData
    const resp = await withRetry(() =>
      axios.post(url, formData, {
        params: { access_token: token, type: 'image' },
        timeout: 30000,
      })
    );

    if (resp.data.errcode && resp.data.errcode !== 0) {
      throw new Error(`上传永久图片失败: errcode=${resp.data.errcode}, errmsg=${resp.data.errmsg}`);
    }

    const mediaId = resp.data.media_id;
    console.log(`永久图片上传成功: media_id=${mediaId}`);
    return mediaId;
  }

  /**
   * 上传正文图片（不占用素材库额度）
   */
  async uploadContentImage(imagePath) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/cgi-bin/media/uploadimg`;

    console.log(`上传正文图片: ${imagePath}`);

    const fileBuffer = await fs.promises.readFile(imagePath);
    const blob = new Blob([fileBuffer]);
    const formData = new FormData();
    formData.append('media', blob, path.basename(imagePath));

    const resp = await withRetry(() =>
      axios.post(url, formData, {
        params: { access_token: token },
        timeout: 30000,
      })
    );

    if (resp.data.errcode && resp.data.errcode !== 0) {
      throw new Error(`上传正文图片失败: errcode=${resp.data.errcode}, errmsg=${resp.data.errmsg}`);
    }

    const imgUrl = resp.data.url;
    if (!imgUrl) throw new Error('上传正文图片成功但未返回 URL');
    console.log(`正文图片上传成功: ${imgUrl.substring(0, 60)}...`);
    return imgUrl;
  }

  /**
   * 创建图文草稿
   */
  async addDraft(article) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/cgi-bin/draft/add`;

    console.log(`创建草稿: ${article.title}`);

    const resp = await withRetry(() =>
      axios.post(url, { articles: [article] }, {
        params: { access_token: token },
        timeout: 30000,
      })
    );

    if (resp.data.errcode && resp.data.errcode !== 0) {
      throw new Error(`创建草稿失败: errcode=${resp.data.errcode}, errmsg=${resp.data.errmsg}`);
    }

    const draftMediaId = resp.data.media_id;
    console.log(`草稿创建成功: media_id=${draftMediaId}`);
    return draftMediaId;
  }

  /**
   * 提交发布
   */
  async publish(draftMediaId) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/cgi-bin/freepublish/submit`;

    console.log(`提交发布: media_id=${draftMediaId}`);

    const resp = await withRetry(() =>
      axios.post(url, { media_id: draftMediaId }, {
        params: { access_token: token },
        timeout: 30000,
      })
    );

    if (resp.data.errcode && resp.data.errcode !== 0) {
      throw new Error(`发布失败: errcode=${resp.data.errcode}, errmsg=${resp.data.errmsg}`);
    }

    const publishId = resp.data.publish_id;
    console.log(`发布提交成功: publish_id=${publishId}`);
    return publishId;
  }
}

module.exports = { WeChatClient };
