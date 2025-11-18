"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const block_basekit_server_api_1 = require("@lark-opdev/block-basekit-server-api");
const tos_sdk_1 = require("@volcengine/tos-sdk");
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
            const svg = generateSVGFromTable(headers, normalizedRowsForSvg(headers, dataRows));
            const svgBuffer = Buffer.from(svg, 'utf-8');
            const fileName = `table_${Date.now()}.svg`;
            if (!accessKeyId || !accessKeySecret || !bucket || !region) {
                return { code: block_basekit_server_api_1.FieldCode.ConfigError };
            }
            const tosUrl = await uploadToTOS(svgBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region });
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
async function generateTableImage(html, context) {
    // 使用htmlcsstoimage API生成图片
    const apiUrl = 'https://htmlcsstoimage.com/api/v1/image';
    try {
        const response = await context.fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html,
                css: '',
                width: 800,
                quality: 88,
                format: 'png'
            })
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
        // 备用方案：生成简单的SVG表格
        return generateSVGTable(html);
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
async function uploadToTOS(buffer, fileName, cred) {
    try {
        const n = normalizeRegion(cred.region);
        const client = new tos_sdk_1.TosClient({ accessKeyId: cred.accessKeyId, accessKeySecret: cred.accessKeySecret, region: n.region, endpoint: n.endpoint });
        const key = `table_images/${fileName}`;
        await client.putObject({ bucket: cred.bucket, key, body: buffer, contentType: 'image/svg+xml' });
        const url = `https://${cred.bucket}.${n.host}/${key}`;
        return url;
    }
    catch (e) {
        console.log('====tos_upload_error', String(e));
        return null;
    }
}
exports.default = block_basekit_server_api_1.basekit;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxtRkFBNEc7QUFDNUcsaURBQWdEO0FBQ2hELE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxnQ0FBSyxDQUFDO0FBRXBCLE1BQU0sUUFBUSxHQUFHLENBQUMsV0FBVyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDdkkscURBQXFEO0FBQ3JELGtDQUFPLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRWhDLGtDQUFPLENBQUMsUUFBUSxDQUFDO0lBQ2YsZ0JBQWdCO0lBQ2hCLElBQUksRUFBRTtRQUNKLFFBQVEsRUFBRTtZQUNSLE9BQU8sRUFBRTtnQkFDUCxXQUFXLEVBQUUsVUFBVTtnQkFDdkIsWUFBWSxFQUFFLE1BQU07Z0JBQ3BCLFlBQVksRUFBRSxJQUFJO2dCQUNsQixZQUFZLEVBQUUscUNBQXFDO2FBQ3BEO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLFdBQVcsRUFBRSxtQkFBbUI7Z0JBQ2hDLFlBQVksRUFBRSxhQUFhO2dCQUMzQixZQUFZLEVBQUUsWUFBWTtnQkFDMUIsWUFBWSxFQUFFLG9FQUFvRTthQUNuRjtTQUNGO0tBQ0Y7SUFDRCxVQUFVO0lBQ1YsU0FBUyxFQUFFO1FBQ1Q7WUFDRSxHQUFHLEVBQUUsYUFBYTtZQUNsQixLQUFLLEVBQUUsYUFBYTtZQUNwQixTQUFTLEVBQUUseUNBQWMsQ0FBQyxLQUFLO1lBQy9CLEtBQUssRUFBRTtnQkFDTCxXQUFXLEVBQUUsaUJBQWlCO2FBQy9CO1lBQ0QsU0FBUyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtTQUM5QjtRQUNEO1lBQ0UsR0FBRyxFQUFFLGlCQUFpQjtZQUN0QixLQUFLLEVBQUUsaUJBQWlCO1lBQ3hCLFNBQVMsRUFBRSx5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