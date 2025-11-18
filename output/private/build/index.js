"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const block_basekit_server_api_1 = require("@lark-opdev/block-basekit-server-api");
const tos_sdk_1 = require("@volcengine/tos-sdk");
const sharp_1 = __importDefault(require("sharp"));
const { t } = block_basekit_server_api_1.field;
const feishuDm = ['feishu.cn', 'open.feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com', 'htmlcsstoimage.com', '0x0.st'];
// 通过addDomainList添加请求接口的域名，不可写多个addDomainList，否则会被覆盖
block_basekit_server_api_1.basekit.addDomainList(feishuDm);
block_basekit_server_api_1.basekit.addField({
    // 定义捷径的i18n语言资源
    i18n: {
        messages: {
            'zh-CN': {
                'textInput': '待生成的文本字段',
                'tableImage': '表格图片',
                'attachment': '附件',
                'parseError': '文本格式错误，请使用格式：# header: 列1 | 列2 | 列3',
            },
            'en-US': {
                'textInput': 'Source Text Field',
                'tableImage': 'Table Image',
                'attachment': 'Attachment',
                'parseError': 'Text format error, please use format: # header: col1 | col2 | col3',
            },
        }
    },
    // 定义捷径的入参
    formItems: [
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
        {
            key: 'sourceTextField',
            label: t('textInput'),
            component: block_basekit_server_api_1.FieldComponent.FieldSelect,
            props: {
                supportType: [block_basekit_server_api_1.FieldType.Text],
            },
            validator: { required: true }
        },
    ],
    // 定义捷径的返回结果类型
    resultType: {
        type: block_basekit_server_api_1.FieldType.Text,
    },
    // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems
    execute: async (formItemParams, context) => {
        const { accessKeyId = '', accessKeySecret = '', bucket = '', region = '', sourceTextField = '' } = formItemParams;
        /** 为方便查看日志，使用此方法替代console.log */
        function debugLog(arg) {
            console.log(JSON.stringify({
                formItemParams,
                context,
                arg
            }));
        }
        try {
            const input = normalizeTextContent(sourceTextField);
            const lines = input.trim().split('\n');
            if (lines.length < 2) {
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
            // 解析标题行
            const headerLine = lines[0];
            if (!headerLine.startsWith('# header:')) {
                return { code: block_basekit_server_api_1.FieldCode.Error };
            }
            const headerText = headerLine.replace('# header:', '').trim();
            const headers = headerText.split('|').map(h => h.trim());
            // 解析数据行
            const dataRows = lines.slice(1).map(line => {
                return line.split('|').map(cell => cell.trim());
            });
            debugLog({
                '===1 解析结果': { headers, dataRows }
            });
            // 生成HTML表格
            const tableHtml = generateTableHTML(headers, dataRows);
            debugLog({
                '===2 生成的HTML': tableHtml
            });
            const pngBuffer = await renderTablePNG(headers, normalizedRowsForSvg(headers, dataRows));
            const fileName = `table_${Date.now()}.png`;
            if (!accessKeyId || !accessKeySecret || !bucket || !region) {
                return { code: block_basekit_server_api_1.FieldCode.ConfigError };
            }
            const tosUrl = await uploadToTOS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png');
            if (tosUrl) {
                return {
                    code: block_basekit_server_api_1.FieldCode.Success,
                    data: tosUrl
                };
            }
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
    const dataUrl = await generateTableImage(html, width, context);
    const isPNG = /^data:image\/png;base64,/.test(dataUrl);
    const isSVG = /^data:image\/svg\+xml;base64,/.test(dataUrl);
    if (isPNG) {
        const png = dataUrlToBuffer(dataUrl);
        const webp = await (0, sharp_1.default)(png).webp({ quality: 82, nearLossless: true, smartSubsample: true }).toBuffer();
        return webp;
    }
    const svg = isSVG ? Buffer.from(dataUrl.split(',')[1], 'base64') : Buffer.from(generateSVGFromTable(headers, rows), 'utf-8');
    const webp = await (0, sharp_1.default)(svg).webp({ quality: 82, nearLossless: true, smartSubsample: true }).toBuffer();
    return webp;
}
async function renderTableWebP(headers, rows) {
    const svg = generateRichSVG(headers, rows);
    const buf = Buffer.from(svg, 'utf-8');
    const webp = await (0, sharp_1.default)(buf, { density: 168 }).webp({ quality: 84, nearLossless: true, smartSubsample: true }).toBuffer();
    return webp;
}
async function renderTablePNG(headers, rows) {
    const svg = generateRichSVG(headers, rows);
    const buf = Buffer.from(svg, 'utf-8');
    const png = await (0, sharp_1.default)(buf, { density: 240 }).png({ compressionLevel: 9, palette: true, colors: 64 }).toBuffer();
    return png;
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
    const minWidth = 140;
    const maxWidth = 600;
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
    const headerFont = 14;
    const bodyFont = 13;
    const headerLine = 18;
    const bodyLine = 17;
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
            svg += `<line x1="${sx}" y1="${startY}" x2="${sx}" y2="${startY + headerHeight + bodyHeight}" stroke="${borderColor}" stroke-width="1"/>`;
        }
    });
    let yCursor = startY + headerHeight;
    rows.forEach((r, ri) => {
        const rh = rowHeights[ri];
        svg += `<line x1="${padding}" y1="${yCursor}" x2="${padding + tableWidth}" y2="${yCursor}" stroke="${borderColor}" stroke-width="1"/>`;
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
    svg += `<rect x="${padding}" y="${startY}" width="${tableWidth}" height="${headerHeight + bodyHeight}" fill="none" stroke="${borderColor}" stroke-width="1"/>`;
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
exports.default = block_basekit_server_api_1.basekit;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxtRkFBNEc7QUFDNUcsaURBQWdEO0FBQ2hELGtEQUEwQjtBQUMxQixNQUFNLEVBQUUsQ0FBQyxFQUFFLEdBQUcsZ0NBQUssQ0FBQztBQUVwQixNQUFNLFFBQVEsR0FBRyxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZJLHFEQUFxRDtBQUNyRCxrQ0FBTyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUVoQyxrQ0FBTyxDQUFDLFFBQVEsQ0FBQztJQUNmLGdCQUFnQjtJQUNoQixJQUFJLEVBQUU7UUFDSixRQUFRLEVBQUU7WUFDUixPQUFPLEVBQUU7Z0JBQ1AsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLFlBQVksRUFBRSxNQUFNO2dCQUNwQixZQUFZLEVBQUUsSUFBSTtnQkFDbEIsWUFBWSxFQUFFLHFDQUFxQzthQUNwRDtZQUNELE9BQU8sRUFBRTtnQkFDUCxXQUFXLEVBQUUsbUJBQW1CO2dCQUNoQyxZQUFZLEVBQUUsYUFBYTtnQkFDM0IsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLFlBQVksRUFBRSxvRUFBb0U7YUFDbkY7U0FDRjtLQUNGO0lBQ0QsVUFBVTtJQUNWLFNBQVMsRUFBRTtRQUNUO1lBQ0UsR0FBRyxFQUFFLGFBQWE7WUFDbEIsS0FBSyxFQUFFLGFBQWE7WUFDcEIsU0FBUyxFQUFFLHlDQUFjLENBQUMsS0FBSztZQUMvQixLQUFLLEVBQUU7Z0JBQ0wsV0FBVyxFQUFFLGlCQUFpQjthQUMvQjtZQUNELFNBQVMsRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7U0FDOUI7UUFDRDtZQUNFLEdBQUcsRUFBRSxpQkFBaUI7WUFDdEIsS0FBSyxFQUFFLGlCQUFpQjtZ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