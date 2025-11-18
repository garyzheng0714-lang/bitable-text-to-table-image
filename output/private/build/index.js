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
const { t } = block_basekit_server_api_1.field;
const feishuDm = ['feishu.cn', 'open.feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com', 'internal-api-drive-stream.feishu.cn', 'aliyuncs.com', 'volces.com', 'htmlcsstoimage.com'];
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
                safe: { storage, bucket, region, processType },
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
            const pngBuffer = await renderTablePNG(headers, normalizedRowsForSvg(headers, dataRows), context);
            const ts = `-${Date.now()}`;
            const baseNameRaw = normalizeSingleSelectValue(nameField);
            const baseName = sanitizeFileName(baseNameRaw);
            const fileName = baseName ? appendTimestamp(ensureExt(baseName, '.png'), ts) : `table-${Date.now()}.png`;
            if (!accessKeyId || !accessKeySecret || !bucket || !region) {
                return { code: block_basekit_server_api_1.FieldCode.ConfigError };
            }
            const useOSS = isOSSSelected(storage);
            debugLog({ '===4 上传参数': { useOSS, fileName, bucket, region } });
            if (!pngBuffer || pngBuffer.length === 0) {
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
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
async function renderTablePNG(headers, rows, context) {
    const svg = generateRichSVG(headers, rows);
    try {
        const mod = require('@resvg/resvg-js');
        const ResvgCtor = mod?.Resvg || mod?.default?.Resvg || mod?.default;
        if (ResvgCtor) {
            const resvg = new ResvgCtor(svg, { background: 'white', fitTo: { mode: 'zoom', value: 2 } });
            const rendered = resvg.render();
            return Buffer.from(rendered.asPng());
        }
        throw new Error('resvg_unavailable');
    }
    catch (e) {
        try {
            if (context) {
                const html = generateTableHTML(headers, rows);
                const width = computeColumnWidths(headers, rows).reduce((a, b) => a + b, 0) + 48;
                const dataUrl = await generateTableImage(html, width, context);
                const buf = dataUrlToBuffer(dataUrl);
                if (buf && buf.length > 0)
                    return buf;
            }
        }
        catch { }
        return Buffer.alloc(0);
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxtRkFBNEc7QUFDNUcsaURBQWdEO0FBQ2hELHNEQUEwQjtBQUUxQixNQUFNLFlBQVksR0FBUTtJQUN4QixHQUFHLEVBQUUsU0FBUztJQUNkLEtBQUssRUFBRSxNQUFNO0lBQ2IsU0FBUyxFQUFFLHlDQUFjLENBQUMsS0FBSztJQUMvQixLQUFLLEVBQUU7UUFDTCxPQUFPLEVBQUU7WUFDUCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRTtZQUNqQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtTQUNuQztRQUNELFdBQVcsRUFBRSxTQUFTO0tBQ3ZCO0lBQ0QsWUFBWSxFQUFFLEtBQUs7SUFDbkIsU0FBUyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtDQUM5QixDQUFDO0FBQ0YsTUFBTSxhQUFhLEdBQVE7SUFDekIsR0FBRyxFQUFFLGFBQWE7SUFDbEIsS0FBSyxFQUFFLE1BQU07SUFDYixTQUFTLEVBQUUseUNBQWMsQ0FBQyxZQUFZO0lBQ3RDLEtBQUssRUFBRTtRQUNMLE9BQU8sRUFBRTtZQUNQLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUU7WUFDaEQsRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFO1NBQzlEO1FBQ0QsV0FBVyxFQUFFLFNBQVM7S0FDdkI7SUFDRCxZQUFZLEVBQUUsa0JBQWtCO0lBQ2hDLFNBQVMsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7Q0FDOUIsQ0FBQztBQUVGLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxnQ0FBSyxDQUFDO0FBRXBCLE1BQU0sUUFBUSxHQUFHLENBQUMsV0FBVyxFQUFFLGdCQUFnQixF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