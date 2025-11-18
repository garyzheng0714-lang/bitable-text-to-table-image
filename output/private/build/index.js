"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const block_basekit_server_api_1 = require("@lark-opdev/block-basekit-server-api");
const tos_sdk_1 = require("@volcengine/tos-sdk");
const ali_oss_1 = __importDefault(require("ali-oss"));
const storageRadio = {
    key: 'storage',
    label: '存储服务',
    component: block_basekit_server_api_1.FieldComponent.Radio,
    props: {
        options: [
            { value: 'OSS', label: '阿里云OSS' },
            { value: 'TOS', label: '火山引擎TOS' }
        ],
        placeholder: '请选择存储服务'
    },
    defaultValue: 'OSS',
    validator: { required: true }
};
const processSelect = {
    key: 'processType',
    label: '处理方式',
    component: block_basekit_server_api_1.FieldComponent.SingleSelect,
    props: {
        options: [
            { value: 'ATTACHMENT_LINK', label: '附件 → 下载链接' },
            { value: 'TEXT_TABLE_IMAGE', label: '文本 → 生成表格图片并上传，返回下载链接' }
        ],
        placeholder: '请选择处理方式'
    },
    defaultValue: 'TEXT_TABLE_IMAGE',
    validator: { required: true }
};
const resvg_js_1 = require("@resvg/resvg-js");
const { t } = block_basekit_server_api_1.field;
const feishuDm = ['feishu.cn', 'open.feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com', 'internal-api-drive-stream.feishu.cn', 'aliyuncs.com', 'volces.com'];
// 通过addDomainList添加请求接口的域名，不可写多个addDomainList，否则会被覆盖
block_basekit_server_api_1.basekit.addDomainList(feishuDm);
block_basekit_server_api_1.basekit.addField({
    // 定义捷径的i18n语言资源
    i18n: {
        messages: {
            'zh-CN': {
                'textInput': '待生成的字段',
                'tableImage': '表格图片',
                'attachment': '附件',
                'parseError': '文本格式错误，请使用格式：# header: 列1 | 列2 | 列3',
            },
            'en-US': {
                'textInput': 'Source Field',
                'tableImage': 'Table Image',
                'attachment': 'Attachment',
                'parseError': 'Text format error, please use format: # header: col1 | col2 | col3',
            },
        }
    },
    // 定义捷径的入参
    formItems: [
        storageRadio,
        {
            key: 'accessKeyId',
            label: 'AccessKeyId',
            component: block_basekit_server_api_1.FieldComponent.Input,
            props: {
                placeholder: '请输入 AccessKeyId',
            },
            validator: { required: true }
        },
        {
            key: 'accessKeySecret',
            label: 'AccessKeySecret',
            component: block_basekit_server_api_1.FieldComponent.Input,
            props: {
                placeholder: '请输入 AccessKeySecret',
            },
            validator: { required: true }
        },
        {
            key: 'bucket',
            label: 'Bucket',
            component: block_basekit_server_api_1.FieldComponent.Input,
            props: {
                placeholder: '请输入 Bucket 名称',
            },
            validator: { required: true }
        },
        {
            key: 'region',
            label: 'Region',
            component: block_basekit_server_api_1.FieldComponent.Input,
            props: {
                placeholder: '例如 cn-beijing',
            },
            validator: { required: true }
        },
        processSelect,
        {
            key: 'sourceTextField',
            label: t('textInput'),
            component: block_basekit_server_api_1.FieldComponent.FieldSelect,
            props: {
                supportType: [block_basekit_server_api_1.FieldType.Text, block_basekit_server_api_1.FieldType.Attachment],
                placeholder: '可选择文本或附件字段；与上方“处理方式”保持一致'
            },
            validator: { required: true }
        },
        {
            key: 'nameField',
            label: '文件名称',
            component: block_basekit_server_api_1.FieldComponent.FieldSelect,
            props: {
                supportType: [block_basekit_server_api_1.FieldType.Text],
                placeholder: '可选，选择文本/公式字段作为文件名（非附件）'
            }
        },
    ],
    // 定义捷径的返回结果类型
    resultType: {
        type: block_basekit_server_api_1.FieldType.Text,
    },
    // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems
    execute: async (formItemParams, context) => {
        const { storage, accessKeyId = '', accessKeySecret = '', bucket = '', region = '', processType = 'TEXT_TABLE_IMAGE', nameField = undefined, sourceTextField = '' } = formItemParams;
        /** 为方便查看日志，使用此方法替代console.log */
        function debugLog(arg) {
            console.log(JSON.stringify({
                formItemParams,
                context,
                arg
            }));
        }
        try {
            const selectedType = inferFieldValueType(sourceTextField);
            const pType = normalizeProcessType(processType);
            debugLog({ '===0 分支选择': { processType: pType, selectedType } });
            if (pType === 'ATTACHMENT_LINK') {
                if (selectedType !== 'attachment') {
                    return { code: block_basekit_server_api_1.FieldCode.ConfigError };
                }
                if (!accessKeyId || !accessKeySecret || !bucket || !region) {
                    return { code: block_basekit_server_api_1.FieldCode.ConfigError };
                }
                const fetched = await fetchAttachmentBuffer(sourceTextField, context);
                if (fetched && fetched.buffer && fetched.buffer.length > 0) {
                    const useOSS = isOSSSelected(storage);
                    const baseNameRaw = normalizeSingleSelectValue(nameField);
                    const baseName = sanitizeFileName(baseNameRaw);
                    const extFromName = getExtFromFilename(fetched.filename || '');
                    const extFromType = extFromContentType(fetched.contentType || '');
                    const ext = extFromName || extFromType || '';
                    const ts = `-${Date.now()}`;
                    let keyName;
                    if (baseName) {
                        const withExt = ensureExt(baseName, ext || '');
                        keyName = appendTimestamp(withExt, ts);
                    }
                    else if (fetched.filename) {
                        const withExt = ensureExt(fetched.filename, ext || '');
                        keyName = appendTimestamp(withExt, ts);
                    }
                    else {
                        keyName = `attachment-${Date.now()}${ext || ''}`;
                    }
                    const url = useOSS
                        ? await uploadToOSS(fetched.buffer, keyName, { accessKeyId, accessKeySecret, bucket, region }, fetched.contentType || 'application/octet-stream')
                        : await uploadToTOS(fetched.buffer, keyName, { accessKeyId, accessKeySecret, bucket, region }, fetched.contentType || 'application/octet-stream');
                    if (url) {
                        return { code: block_basekit_server_api_1.FieldCode.Success, data: url };
                    }
                }
                const fallback = await extractAttachmentDownloadUrl(sourceTextField, context);
                if (fallback) {
                    return { code: block_basekit_server_api_1.FieldCode.Success, data: fallback };
                }
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
            if (selectedType !== 'text') {
                return { code: block_basekit_server_api_1.FieldCode.ConfigError };
            }
            const input = normalizeTextContent(sourceTextField);
            const lines = input.trim().split('\n');
            if (lines.length < 2) {
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
            const rawHeader = lines[0];
            const headerText = rawHeader.startsWith('# header:') ? rawHeader.replace('# header:', '').trim() : rawHeader.trim();
            if (!headerText.includes('|')) {
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
            const headers = headerText.split('|').map(h => h.trim());
            const dataRows = lines.slice(1)
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => line.split('|').map(cell => cell.trim()))
                .filter(row => row.some(cell => cell.length > 0));
            debugLog({ '===1 解析结果': { headers, dataRows } });
            const tableHtml = generateTableHTML(headers, dataRows);
            debugLog({ '===2 生成的HTML': tableHtml });
            const pngBuffer = await renderTablePNG(headers, normalizedRowsForSvg(headers, dataRows));
            debugLog({ '===3 渲染PNG': { byteLength: pngBuffer?.length || 0 } });
            const baseNameRaw = normalizeSingleSelectValue(nameField);
            const baseName = sanitizeFileName(baseNameRaw);
            const ts = `-${Date.now()}`;
            const fileName = baseName ? appendTimestamp(ensureExt(baseName, '.png'), ts) : `table-${Date.now()}.png`;
            if (!accessKeyId || !accessKeySecret || !bucket || !region) {
                return { code: block_basekit_server_api_1.FieldCode.ConfigError };
            }
            const useOSS = isOSSSelected(storage);
            debugLog({ '===4 上传参数': { useOSS, fileName, bucket, region } });
            const url = useOSS
                ? await uploadToOSS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png')
                : await uploadToTOS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png');
            if (url) {
                return { code: block_basekit_server_api_1.FieldCode.Success, data: url };
            }
            debugLog({ '===5 上传失败': { useOSS, fileName, bucket, region } });
            return { code: block_basekit_server_api_1.FieldCode.Error };
        }
        catch (e) {
            console.log('====error', String(e));
            debugLog({
                '===999 异常错误': String(e)
            });
            return {
                code: block_basekit_server_api_1.FieldCode.Error,
            };
        }
    },
});
function normalizeTextContent(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value)) {
        return value.map((v) => {
            if (typeof v === 'string')
                return v;
            if (v && typeof v === 'object' && 'text' in v)
                return String(v.text ?? '');
            return '';
        }).join('');
    }
    if (value && typeof value === 'object' && 'text' in value)
        return String(value.text ?? '');
    return '';
}
function inferFieldValueType(value) {
    function hasFileIndicators(obj) {
        if (!obj || typeof obj !== 'object')
            return false;
        if (obj.file_token || obj.token || obj.fileToken)
            return true;
        if (obj.url || obj.tmp_url || obj.file_url || obj.download_url || obj.downloadUrl || obj.link)
            return true;
        return false;
    }
    if (Array.isArray(value)) {
        const arr = value;
        const hasFile = arr.some((v) => hasFileIndicators(v));
        const hasText = arr.some((v) => typeof v === 'string' || (v && typeof v === 'object' && 'text' in v));
        if (hasFile)
            return 'attachment';
        if (hasText)
            return 'text';
        return 'text';
    }
    if (typeof value === 'string')
        return 'text';
    if (value && typeof value === 'object') {
        if ('text' in value)
            return 'text';
        if (hasFileIndicators(value))
            return 'attachment';
    }
    return 'text';
}
function normalizeProcessType(v) {
    const s = typeof v === 'object' ? String(v?.value ?? v?.name ?? v?.label ?? '') : String(v ?? '');
    if (/ATTACHMENT/i.test(s) || /附件/.test(s))
        return 'ATTACHMENT_LINK';
    return 'TEXT_TABLE_IMAGE';
}
function normalizeSingleSelectValue(value) {
    if (Array.isArray(value)) {
        let acc = '';
        for (const item of value) {
            if (typeof item === 'string')
                acc += item;
            else if (item && typeof item === 'object') {
                const v = (item?.name ?? item?.label ?? item?.text ?? item?.value ?? '');
                acc += String(v || '');
            }
        }
        return acc.trim();
    }
    if (typeof value === 'string')
        return value.trim();
    if (value && typeof value === 'object') {
        const v = (value?.name ?? value?.label ?? value?.text ?? value?.value ?? '');
        return String(v || '').trim();
    }
    return '';
}
function sanitizeFileName(name) {
    const n = String(name || '').trim();
    if (!n)
        return '';
    const s = n.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
    return s.slice(0, 80);
}
function getExtFromFilename(name) {
    const n = String(name || '');
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(n);
    return m ? `.${m[1].toLowerCase()}` : '';
}
function extFromContentType(ct) {
    const c = String(ct || '').toLowerCase();
    if (c.includes('image/png'))
        return '.png';
    if (c.includes('image/jpeg'))
        return '.jpg';
    if (c.includes('image/jpg'))
        return '.jpg';
    if (c.includes('image/webp'))
        return '.webp';
    if (c.includes('image/gif'))
        return '.gif';
    if (c.includes('application/pdf'))
        return '.pdf';
    if (c.includes('text/plain'))
        return '.txt';
    return '';
}
function ensureExt(base, ext) {
    const b = String(base || '');
    const e = String(ext || '');
    if (!e)
        return b;
    if (/\.[a-z0-9]{1,8}$/i.test(b))
        return b;
    return `${b}${e}`;
}
function appendTimestamp(name, ts) {
    const n = String(name || '');
    const t = String(ts || '');
    if (!t)
        return n;
    const idx = n.lastIndexOf('.');
    if (idx > 0)
        return `${n.slice(0, idx)}${t}${n.slice(idx)}`;
    return `${n}${t}`;
}
async function resolveFeishuDownloadUrlByToken(token, context) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
        if (envToken)
            headers['Authorization'] = `Bearer ${envToken}`;
        const res = await context.fetch('https://open.feishu.cn/open-apis/drive/v1/files/get_download_url', {
            method: 'POST',
            headers,
            body: JSON.stringify({ file_token: token })
        });
        const text = await res.text();
        const json = JSON.parse(text || '{}');
        const url = json?.data?.download_url || json?.data?.downloadUrl || json?.download_url || '';
        if (typeof url === 'string' && url.startsWith('http'))
            return url;
        return null;
    }
    catch (e) {
        return null;
    }
}
async function extractAttachmentDownloadUrl(value, context) {
    const items = Array.isArray(value) ? value : [value];
    for (const it of items) {
        const o = it || {};
        const direct = o.url || o.download_url || o.downloadUrl || o.file_url || o.link;
        if (typeof direct === 'string' && direct.startsWith('http'))
            return direct;
        const token = o.file_token || o.token || o.fileToken;
        if (typeof token === 'string' && token) {
            const url = await resolveFeishuDownloadUrlByToken(token, context);
            if (url)
                return url;
        }
    }
    return null;
}
function pickFirstAttachment(value) {
    return Array.isArray(value) ? (value[0] ?? null) : value;
}
function guessFileNameFromAttachment(att, url) {
    const n = (att?.file_name ?? att?.name ?? att?.filename ?? '');
    if (n && typeof n === 'string' && n.trim().length)
        return n.trim();
    const u = String(url || '');
    const m = /\/([^\/?#]+)(?:\?|#|$)/.exec(u);
    if (m && m[1])
        return m[1];
    return `attachment_${Date.now()}`;
}
function authHeadersForUrl(u) {
    try {
        const url = new URL(u);
        const host = url.hostname || '';
        const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
        if (envToken && (/feishu\.cn$/.test(host) || /larksuite\.com$/.test(host) || /larksuitecdn\.com$/.test(host) || /open\.feishu\.cn$/.test(host))) {
            return { Authorization: `Bearer ${envToken}` };
        }
    }
    catch { }
    return {};
}
async function fetchBufferFromUrl(u, context) {
    try {
        const headers = authHeadersForUrl(u);
        const res = await context.fetch(u, { method: 'GET', headers });
        const ct = (res.headers?.get?.('content-type') || 'application/octet-stream');
        const cd = res.headers?.get?.('content-disposition') || '';
        let filename = '';
        const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
        if (m)
            filename = decodeURIComponent(m[1] || m[2] || '');
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        return { buffer: buf, contentType: ct, filename: filename || '' };
    }
    catch (e) {
        return null;
    }
}
async function fetchAttachmentBuffer(value, context) {
    const att = pickFirstAttachment(value);
    const direct = (att?.url || att?.tmp_url || att?.download_url || att?.downloadUrl || att?.file_url || att?.link);
    if (direct && typeof direct === 'string' && direct.startsWith('http')) {
        const fetched = await fetchBufferFromUrl(direct, context);
        if (fetched) {
            return { buffer: fetched.buffer, contentType: fetched.contentType, filename: fetched.filename || guessFileNameFromAttachment(att, direct) };
        }
    }
    const token = (att?.file_token || att?.token || att?.fileToken);
    if (token && typeof token === 'string') {
        const url = await resolveFeishuDownloadUrlByToken(token, context);
        if (url) {
            const fetched = await fetchBufferFromUrl(url, context);
            if (fetched) {
                return { buffer: fetched.buffer, contentType: fetched.contentType, filename: fetched.filename || guessFileNameFromAttachment(att, url) };
            }
        }
    }
    return null;
}
/**
 * 生成表格HTML
 */
function generateTableHTML(headers, dataRows) {
    const maxCols = headers.length;
    // 确保所有行都有相同数量的列
    const normalizedRows = dataRows.map(row => {
        const normalizedRow = [...row];
        while (normalizedRow.length < maxCols) {
            normalizedRow.push('');
        }
        return normalizedRow.slice(0, maxCols);
    });
    // 计算列宽（基于字符长度）
    const colWidths = headers.map((header, index) => {
        let maxWidth = header.length;
        normalizedRows.forEach(row => {
            maxWidth = Math.max(maxWidth, (row[index] || '').length);
        });
        return Math.max(maxWidth * 12, 80); // 最小宽度80px，每个字符大约12px
    });
    // 生成HTML
    let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: #ffffff; padding: 20px;">
      <table style="border-collapse: collapse; width: auto; margin: 0 auto; background: #ffffff;">
        <thead>
          <tr style="background: #f8f9fa;">
  `;
    // 表头
    headers.forEach((header, index) => {
        html += `
      <th style="
        padding: 12px 16px;
        text-align: center;
        font-weight: 600;
        color: #374151;
        border-top: 1px solid #e5e7eb;
        border-left: 1px solid #e5e7eb;
        border-right: 1px solid #e5e7eb;
        border-bottom: 2px solid #dbe2ea;
        min-width: ${colWidths[index]}px;
        font-size: 14px;
      ">${header}</th>
    `;
    });
    html += `
          </tr>
        </thead>
        <tbody>
  `;
    // 数据行
    normalizedRows.forEach((row, rowIndex) => {
        html += `
      <tr style="${rowIndex % 2 === 0 ? 'background: #ffffff;' : 'background: #f9fafb;'}">
    `;
        row.forEach((cell, colIndex) => {
            html += `
        <td style="
          padding: 10px 16px;
          text-align: center;
          color: #6b7280;
          border: 1px solid #e5e7eb;
          font-size: 13px;
        ">${cell || ''}</td>
      `;
        });
        html += `
      </tr>
    `;
    });
    html += `
        </tbody>
      </table>
    </div>
  `;
    return html;
}
function normalizedRowsForSvg(headers, dataRows) {
    const maxCols = headers.length;
    return dataRows.map(row => {
        const r = [...row];
        while (r.length < maxCols)
            r.push('');
        return r.slice(0, maxCols);
    });
}
/**
 * 生成表格图片
 */
async function generateTableImage(html, width, context) {
    // 使用htmlcsstoimage API生成图片
    const apiUrl = 'https://htmlcsstoimage.com/api/v1/image';
    try {
        const response = await context.fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ html, css: '', width, quality: 88, format: 'png' })
        });
        if (!response.ok) {
            throw new Error(`Image generation failed: ${response.status}`);
        }
        const imageBuffer = await response.arrayBuffer();
        // 转换为base64
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        return `data:image/png;base64,${base64Image}`;
    }
    catch (error) {
        console.log('====image_error', String(error));
        return generateSVGTable(html);
    }
}
function dataUrlToBuffer(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m)
        return Buffer.alloc(0);
    return Buffer.from(m[2], 'base64');
}
async function renderOptimizedImage(html, headers, rows, width, context) {
    return renderTablePNG(headers, rows);
}
async function renderTableWebP(headers, rows) {
    const svg = generateRichSVG(headers, rows);
    const resvg = new resvg_js_1.Resvg(svg, { background: 'white', fitTo: { mode: 'zoom', value: 2 } });
    const rendered = resvg.render();
    return Buffer.from(rendered.asPng());
}
async function renderTablePNG(headers, rows) {
    const svg = generateRichSVG(headers, rows);
    const resvg = new resvg_js_1.Resvg(svg, { background: 'white', fitTo: { mode: 'zoom', value: 2 } });
    const rendered = resvg.render();
    return Buffer.from(rendered.asPng());
}
/**
 * 生成SVG表格（备用方案）
 */
function generateSVGTable(html) {
    // 简化的SVG表格生成，实际使用时需要更复杂的解析
    const svg = `
    <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="14" fill="#666">
        Table image generation in progress...
      </text>
    </svg>
  `;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
function estimateTextPixels(s) {
    let px = 0;
    for (const ch of String(s)) {
        const code = ch.charCodeAt(0);
        if (code <= 0x7f)
            px += 8;
        else if (code <= 0xffff)
            px += 14;
        else
            px += 16;
    }
    return Math.max(80, px);
}
function computeColumnWidths(headers, rows) {
    const minWidth = 160;
    const maxWidth = 720;
    return headers.map((h, i) => {
        const headerPx = estimateTextPixels(h) + 28;
        let cellMax = 0;
        rows.forEach(r => { cellMax = Math.max(cellMax, estimateTextPixels(r[i] || '')); });
        const want = Math.max(headerPx, cellMax);
        return Math.max(minWidth, Math.min(maxWidth, Math.ceil(want)));
    });
}
function formatCellContent(cell) {
    const v = cell || '';
    if (/^https?:\/\//.test(v))
        return `<a href="${v}" target="_blank">${v}</a>`;
    return v;
}
function generateSVGFromTable(headers, rows) {
    const colWidths = headers.map((h, i) => {
        let maxLen = h.length;
        rows.forEach(r => { maxLen = Math.max(maxLen, (r[i] || '').length); });
        return Math.max(maxLen * 12, 80);
    });
    const colX = colWidths.reduce((acc, w, idx) => {
        const x = idx === 0 ? 0 : acc[idx - 1] + colWidths[idx - 1];
        acc.push(x);
        return acc;
    }, []);
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const rowHeight = 40;
    const headerHeight = 44;
    const bodyHeight = rows.length * rowHeight;
    const padding = 24;
    const width = tableWidth + padding * 2;
    const height = headerHeight + bodyHeight + padding * 2 + 16;
    const borderColor = '#e5e7eb';
    const headerText = '#374151';
    const bodyText = '#6b7280';
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
    svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
    const startY = padding;
    // Header background
    svg += `<rect x="${padding}" y="${startY}" width="${tableWidth}" height="${headerHeight}" fill="#f8f9fa" stroke="${borderColor}" stroke-width="1"/>`;
    // Header bottom line thicker
    svg += `<line x1="${padding}" y1="${startY + headerHeight}" x2="${padding + tableWidth}" y2="${startY + headerHeight}" stroke="#dbe2ea" stroke-width="2"/>`;
    // Header texts
    headers.forEach((h, i) => {
        const x = padding + colX[i] + colWidths[i] / 2;
        const y = startY + headerHeight / 2 + 5;
        svg += `<text x="${x}" y="${y}" text-anchor="middle" font-family="-apple-system, PingFang SC, Arial, sans-serif" font-size="14" font-weight="600" fill="${headerText}">${escapeXml(h)}</text>`;
        // vertical separators
        if (i > 0) {
            const sx = padding + colX[i];
            svg += `<line x1="${sx}" y1="${startY}" x2="${sx}" y2="${startY + headerHeight + bodyHeight}" stroke="${borderColor}" stroke-width="1"/>`;
        }
    });
    // Body rows
    rows.forEach((r, ri) => {
        const y = startY + headerHeight + ri * rowHeight;
        // row separator
        svg += `<line x1="${padding}" y1="${y}" x2="${padding + tableWidth}" y2="${y}" stroke="${borderColor}" stroke-width="1"/>`;
        r.forEach((cell, ci) => {
            const x = padding + colX[ci] + colWidths[ci] / 2;
            const cy = y + rowHeight / 2 + 5;
            svg += `<text x="${x}" y="${cy}" text-anchor="middle" font-family="-apple-system, PingFang SC, Arial, sans-serif" font-size="13" font-weight="400" fill="${bodyText}">${escapeXml(cell || '')}</text>`;
        });
    });
    // outer border
    svg += `<rect x="${padding}" y="${startY}" width="${tableWidth}" height="${headerHeight + bodyHeight}" fill="none" stroke="${borderColor}" stroke-width="1"/>`;
    svg += `</svg>`;
    return svg;
}
function generateRichSVG(headers, rows) {
    const colWidths = computeColumnWidths(headers, rows);
    const colX = colWidths.reduce((acc, w, idx) => {
        const x = idx === 0 ? 0 : acc[idx - 1] + colWidths[idx - 1];
        acc.push(x);
        return acc;
    }, []);
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const padding = 24;
    const headerFont = 16;
    const bodyFont = 14;
    const headerLine = 20;
    const bodyLine = 18;
    const horizPad = 14;
    const vertPadHeader = 12;
    const vertPadBody = 10;
    const borderColor = '#e5e7eb';
    const headerText = '#374151';
    const bodyText = '#6b7280';
    const headerLines = headers.map((h) => [String(h || '')]);
    const headerHeight = Math.max(44, vertPadHeader * 2 + headerLine);
    const rowLines = rows.map(r => r.map((cell, i) => wrapText(cell || '', colWidths[i] - horizPad * 2, bodyFont)));
    const rowHeights = rowLines.map(cells => Math.max(40, vertPadBody * 2 + Math.max(...cells.map(ls => ls.length)) * bodyLine));
    const bodyHeight = rowHeights.reduce((a, b) => a + b, 0);
    const width = tableWidth + padding * 2;
    const height = headerHeight + bodyHeight + padding * 2 + 16;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges" text-rendering="geometricPrecision">`;
    svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
    const startY = padding;
    svg += `<rect x="${padding}" y="${startY}" width="${tableWidth}" height="${headerHeight}" fill="#f8f9fa" stroke="${borderColor}" stroke-width="1"/>`;
    svg += `<line x1="${padding}" y1="${startY + headerHeight}" x2="${padding + tableWidth}" y2="${startY + headerHeight}" stroke="#dbe2ea" stroke-width="2"/>`;
    headers.forEach((h, i) => {
        const cx = padding + colX[i] + colWidths[i] / 2;
        const baseY = startY + headerHeight / 2 + headerLine * 0.3;
        const line = headerLines[i][0];
        svg += `<text x="${cx}" y="${baseY}" text-anchor="middle" font-family="-apple-system, PingFang SC, Arial, sans-serif" font-size="${headerFont}" font-weight="600" fill="${headerText}">${escapeXml(line)}</text>`;
        if (i > 0) {
            const sx = padding + colX[i];
            svg += `<line x1="${sx}" y1="${startY}" x2="${sx}" y2="${startY + headerHeight + bodyHeight}" stroke="${borderColor}" stroke-width="1.25"/>`;
        }
    });
    let yCursor = startY + headerHeight;
    rows.forEach((r, ri) => {
        const rh = rowHeights[ri];
        svg += `<line x1="${padding}" y1="${yCursor}" x2="${padding + tableWidth}" y2="${yCursor}" stroke="${borderColor}" stroke-width="1.25"/>`;
        r.forEach((cell, ci) => {
            const cx = padding + colX[ci] + colWidths[ci] / 2;
            const lines = rowLines[ri][ci];
            const ch = lines.length * bodyLine;
            const baseY = yCursor + rh / 2 - ch / 2 + bodyLine * 0.8;
            lines.forEach((line, li) => {
                const y = baseY + li * bodyLine;
                svg += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="-apple-system, PingFang SC, Arial, sans-serif" font-size="${bodyFont}" font-weight="400" fill="${bodyText}">${escapeXml(line)}</text>`;
            });
        });
        yCursor += rh;
    });
    svg += `<rect x="${padding}" y="${startY}" width="${tableWidth}" height="${headerHeight + bodyHeight}" fill="none" stroke="${borderColor}" stroke-width="1.25"/>`;
    svg += `</svg>`;
    return svg;
}
function wrapText(text, maxWidthPx, fontPx) {
    const lines = [];
    const src = String(text || '').split(/\n/);
    src.forEach(part => {
        let acc = '';
        let cur = 0;
        for (const ch of part) {
            const w = estimateCharPx(ch, fontPx);
            if (cur + w > maxWidthPx && acc) {
                lines.push(acc);
                acc = ch;
                cur = w;
            }
            else {
                acc += ch;
                cur += w;
            }
        }
        lines.push(acc);
    });
    return lines.length ? lines : [''];
}
function estimateCharPx(ch, fontPx) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f)
        return Math.max(7, Math.floor(fontPx * 0.6));
    if (code <= 0xffff)
        return Math.max(12, Math.floor(fontPx * 1.0));
    return Math.max(12, Math.floor(fontPx * 1.1));
}
function escapeXml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
async function uploadToFeishuDrive(buffer, fileName, folderToken, context) {
    try {
        const size = buffer.length;
        const boundary = `----trae-boundary-${Date.now()}-${Math.random().toString().slice(2)}`;
        const CRLF = '\r\n';
        const parts = [];
        function pushField(name, value) {
            parts.push(Buffer.from(`--${boundary}${CRLF}`));
            parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`));
            parts.push(Buffer.from(`${value}${CRLF}`));
        }
        function pushFile(name, filename, mime, data) {
            parts.push(Buffer.from(`--${boundary}${CRLF}`));
            parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}`));
            parts.push(Buffer.from(`Content-Type: ${mime}${CRLF}${CRLF}`));
            parts.push(data);
            parts.push(Buffer.from(CRLF));
        }
        pushField('file_name', fileName);
        pushField('parent_type', 'explorer');
        if (folderToken)
            pushField('parent_node', folderToken);
        pushField('size', String(size));
        pushFile('file', fileName, 'image/svg+xml', buffer);
        parts.push(Buffer.from(`--${boundary}--${CRLF}`));
        const body = Buffer.concat(parts);
        const headers = {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
        };
        const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
        if (envToken)
            headers['Authorization'] = `Bearer ${envToken}`;
        const res = await context.fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_all', {
            method: 'POST',
            headers,
            body,
        });
        const text = await res.text();
        const json = JSON.parse(text || '{}');
        const token = json?.data?.file_token || json?.data?.data?.file_token || json?.data?.data?.token;
        if (json?.code === 0 && token) {
            return token;
        }
        console.log('====upload_error', text);
        return null;
    }
    catch (e) {
        console.log('====upload_exception', String(e));
        return null;
    }
}
async function uploadToPublicStorage(buffer, fileName, context) {
    try {
        const boundary = `----trae-boundary-${Date.now()}-${Math.random().toString().slice(2)}`;
        const CRLF = '\r\n';
        const parts = [];
        function pushFile(name, filename, mime, data) {
            parts.push(Buffer.from(`--${boundary}${CRLF}`));
            parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}`));
            parts.push(Buffer.from(`Content-Type: ${mime}${CRLF}${CRLF}`));
            parts.push(data);
            parts.push(Buffer.from(CRLF));
        }
        pushFile('file', fileName, 'image/svg+xml', buffer);
        parts.push(Buffer.from(`--${boundary}--${CRLF}`));
        const body = Buffer.concat(parts);
        const res = await context.fetch('https://0x0.st', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        const text = await res.text();
        const url = (text || '').trim();
        if (url.startsWith('http'))
            return url;
        return null;
    }
    catch (e) {
        return null;
    }
}
function isOSSSelected(storage) {
    if (storage == null)
        return true;
    if (typeof storage === 'string')
        return storage === 'OSS' || storage === '阿里云OSS' || /OSS/i.test(storage);
    if (typeof storage === 'object') {
        const v = (storage?.value ?? storage?.name ?? '').toString();
        return v === 'OSS' || v === '阿里云OSS' || /OSS/i.test(v);
    }
    return false;
}
function normalizeRegion(r) {
    const raw = (r || '').trim().toLowerCase();
    const region = raw.replace(/^tos-/, '').replace(/^oss-/, '');
    const endpoint = `tos-${region}.volces.com`;
    const host = `tos-${region}.volces.com`;
    return { region, endpoint, host };
}
async function uploadToTOS(buffer, fileName, cred, contentType) {
    try {
        const n = normalizeRegion(cred.region);
        const client = new tos_sdk_1.TosClient({ accessKeyId: cred.accessKeyId, accessKeySecret: cred.accessKeySecret, region: n.region, endpoint: n.endpoint });
        const key = `table_images/${fileName}`;
        await client.putObject({ bucket: cred.bucket, key, body: buffer, contentType: contentType || 'application/octet-stream' });
        const url = `https://${cred.bucket}.${n.host}/${key}`;
        return url;
    }
    catch (e) {
        console.log('====tos_upload_error', String(e));
        return null;
    }
}
function normalizeOssRegion(r) {
    const raw = (r || '').trim().toLowerCase();
    const region = raw.replace(/^oss-/, '').replace(/^tos-/, '');
    const endpoint = `oss-${region}.aliyuncs.com`;
    const host = `oss-${region}.aliyuncs.com`;
    return { region, endpoint, host };
}
async function uploadToOSS(buffer, fileName, cred, contentType) {
    try {
        const n = normalizeOssRegion(cred.region);
        const client = new ali_oss_1.default({ region: `oss-${n.region}`, accessKeyId: cred.accessKeyId, accessKeySecret: cred.accessKeySecret, bucket: cred.bucket, endpoint: `https://${n.endpoint}` });
        const key = `table_images/${fileName}`;
        await client.put(key, buffer, { headers: { 'Content-Type': contentType || 'application/octet-stream' } });
        const url = `https://${cred.bucket}.${n.host}/${key}`;
        return url;
    }
    catch (e) {
        console.log('====oss_upload_error', String(e));
        return null;
    }
}
exports.default = block_basekit_server_api_1.basekit;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxtRkFBNEc7QUFDNUcsaURBQWdEO0FBQ2hELHNEQUEwQjtBQUUxQixNQUFNLFlBQVksR0FBUTtJQUN4QixHQUFHLEVBQUUsU0FBUztJQUNkLEtBQUssRUFBRSxNQUFNO0lBQ2IsU0FBUyxFQUFFLHlDQUFjLENBQUMsS0FBSztJQUMvQixLQUFLLEVBQUU7UUFDTCxPQUFPLEVBQUU7WUFDUCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtZQUNqQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtTQUNuQztRQUNELFdBQVcsRUFBRSxTQUFTO0tBQ3ZCO0lBQ0QsWUFBWSxFQUFFLEtBQUs7SUFDbkIsU0FBUyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtDQUM5QixDQUFDO0FBQ0YsTUFBTSxhQUFhLEdBQVE7SUFDekIsR0FBRyxFQUFFLGFBQWE7SUFDbEIsS0FBSyxFQUFFLE1BQU07SUFDYixTQUFTLEVBQUUseUNBQWMsQ0FBQyxZQUFZO0lBQ3RDLEtBQUssRUFBRTtRQUNMLE9BQU8sRUFBRTtZQUNQLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUU7WUFDaEQsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFO1NBQzlEO1FBQ0QsV0FBVyxFQUFFLFNBQVM7S0FDdkI7SUFDRCxZQUFZLEVBQUUsa0JBQWtCO0lBQ2hDLFNBQVMsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7Q0FDOUIsQ0FBQztBQUNGLDhDQUF3QztBQUN4QyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEdBQUcsZ0NBQUssQ0FBQztBQUVwQixNQUFNLFFBQVEsR0FBRyxDQUFDLFdBQVcs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