import { basekit, FieldType, field, FieldComponent, FieldCode } from '@lark-opdev/block-basekit-server-api';
import { TosClient } from '@volcengine/tos-sdk';
import sharp from 'sharp';
const { t } = field;

const feishuDm = ['feishu.cn', 'open.feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com', 'htmlcsstoimage.com', '0x0.st'];
// 通过addDomainList添加请求接口的域名，不可写多个addDomainList，否则会被覆盖
basekit.addDomainList(feishuDm);

basekit.addField({
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
      component: FieldComponent.Input,
      props: {
        placeholder: '请输入 AccessKeyId',
      },
      validator: { required: true }
    },
    {
      key: 'accessKeySecret',
      label: 'AccessKeySecret',
      component: FieldComponent.Input,
      props: {
        placeholder: '请输入 AccessKeySecret',
      },
      validator: { required: true }
    },
    {
      key: 'bucket',
      label: 'Bucket',
      component: FieldComponent.Input,
      props: {
        placeholder: '请输入 Bucket 名称',
      },
      validator: { required: true }
    },
    {
      key: 'region',
      label: 'Region',
      component: FieldComponent.Input,
      props: {
        placeholder: '例如 cn-beijing',
      },
      validator: { required: true }
    },
    {
      key: 'sourceTextField',
      label: t('textInput'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text],
      },
      validator: { required: true }
    },
  ],
  // 定义捷径的返回结果类型
  resultType: {
    type: FieldType.Text,
  },
  // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems
  execute: async (formItemParams: { accessKeyId: string; accessKeySecret: string; bucket: string; region: string; sourceTextField: any }, context) => {
    const { accessKeyId = '', accessKeySecret = '', bucket = '', region = '', sourceTextField = '' } = formItemParams;
    
    /** 为方便查看日志，使用此方法替代console.log */
    function debugLog(arg: any) {
      console.log(JSON.stringify({
        formItemParams,
        context,
        arg
      }))
    }

    try {
      const input = normalizeTextContent(sourceTextField);
      const lines = input.trim().split('\n');
      if (lines.length < 2) {
        return { code: FieldCode.Error };
      }

      // 解析标题行
      const headerLine = lines[0];
      if (!headerLine.startsWith('# header:')) {
        return { code: FieldCode.Error };
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
        return { code: FieldCode.ConfigError };
      }

      const tosUrl = await uploadToTOS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png');
      if (tosUrl) {
        return {
          code: FieldCode.Success,
          data: tosUrl
        }
      }

      return { code: FieldCode.Error };

    } catch (e) {
      console.log('====error', String(e));
      debugLog({
        '===999 异常错误': String(e)
      });
      
      return {
        code: FieldCode.Error,
      }
    }
  },
});

function normalizeTextContent(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && 'text' in v) return String((v as any).text ?? '');
      return '';
    }).join('');
  }
  if (value && typeof value === 'object' && 'text' in value) return String((value as any).text ?? '');
  return '';
}

/**
 * 生成表格HTML
 */
function generateTableHTML(headers: string[], dataRows: string[][]): string {
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

function normalizedRowsForSvg(headers: string[], dataRows: string[][]): string[][] {
  const maxCols = headers.length;
  return dataRows.map(row => {
    const r = [...row];
    while (r.length < maxCols) r.push('');
    return r.slice(0, maxCols);
  });
}

/**
 * 生成表格图片
 */
async function generateTableImage(html: string, width: number, context: any): Promise<string> {
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
    
  } catch (error) {
    console.log('====image_error', String(error));
    
    return generateSVGTable(html);
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return Buffer.alloc(0);
  return Buffer.from(m[2], 'base64');
}

async function renderOptimizedImage(html: string, headers: string[], rows: string[][], width: number, context: any): Promise<Buffer> {
  const dataUrl = await generateTableImage(html, width, context);
  const isPNG = /^data:image\/png;base64,/.test(dataUrl);
  const isSVG = /^data:image\/svg\+xml;base64,/.test(dataUrl);
  if (isPNG) {
    const png = dataUrlToBuffer(dataUrl);
    const webp = await sharp(png).webp({ quality: 82, nearLossless: true, smartSubsample: true }).toBuffer();
    return webp;
  }
  const svg = isSVG ? Buffer.from(dataUrl.split(',')[1], 'base64') : Buffer.from(generateSVGFromTable(headers, rows), 'utf-8');
  const webp = await sharp(svg).webp({ quality: 82, nearLossless: true, smartSubsample: true }).toBuffer();
  return webp;
}

async function renderTableWebP(headers: string[], rows: string[][]): Promise<Buffer> {
  const svg = generateRichSVG(headers, rows);
  const buf = Buffer.from(svg, 'utf-8');
  const webp = await sharp(buf, { density: 168 }).webp({ quality: 84, nearLossless: true, smartSubsample: true }).toBuffer();
  return webp;
}

async function renderTablePNG(headers: string[], rows: string[][]): Promise<Buffer> {
  const svg = generateRichSVG(headers, rows);
  const buf = Buffer.from(svg, 'utf-8');
  const png = await sharp(buf, { density: 240 }).png({ compressionLevel: 9, palette: true, colors: 64 }).toBuffer();
  return png;
}

 

/**
 * 生成SVG表格（备用方案）
 */
function generateSVGTable(html: string): string {
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

function estimateTextPixels(s: string): number {
  let px = 0;
  for (const ch of String(s)) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) px += 8;
    else if (code <= 0xffff) px += 14;
    else px += 16;
  }
  return Math.max(80, px);
}

function computeColumnWidths(headers: string[], rows: string[][]): number[] {
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

function formatCellContent(cell: string): string {
  const v = cell || '';
  if (/^https?:\/\//.test(v)) return `<a href="${v}" target="_blank">${v}</a>`;
  return v;
}

function generateSVGFromTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(r => { maxLen = Math.max(maxLen, (r[i] || '').length); });
    return Math.max(maxLen * 12, 80);
  });
  const colX = colWidths.reduce<number[]>((acc, w, idx) => {
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

function generateRichSVG(headers: string[], rows: string[][]): string {
  const colWidths = computeColumnWidths(headers, rows);
  const colX = colWidths.reduce<number[]>((acc, w, idx) => {
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

  const rowLines: string[][][] = rows.map(r => r.map((cell, i) => wrapText(cell || '', colWidths[i] - horizPad * 2, bodyFont)));
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

function wrapText(text: string, maxWidthPx: number, fontPx: number): string[] {
  const lines: string[] = [];
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
      } else {
        acc += ch;
        cur += w;
      }
    }
    lines.push(acc);
  });
  return lines.length ? lines : [''];
}

function estimateCharPx(ch: string, fontPx: number): number {
  const code = ch.charCodeAt(0);
  if (code <= 0x7f) return Math.max(7, Math.floor(fontPx * 0.6));
  if (code <= 0xffff) return Math.max(12, Math.floor(fontPx * 1.0));
  return Math.max(12, Math.floor(fontPx * 1.1));
}

function escapeXml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

async function uploadToFeishuDrive(buffer: Buffer, fileName: string, folderToken: string | undefined, context: any): Promise<string | null> {
  try {
    const size = buffer.length;
    const boundary = `----trae-boundary-${Date.now()}-${Math.random().toString().slice(2)}`;
    const CRLF = '\r\n';

    const parts: Buffer[] = [];
    function pushField(name: string, value: string) {
      parts.push(Buffer.from(`--${boundary}${CRLF}`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`));
      parts.push(Buffer.from(`${value}${CRLF}`));
    }
    function pushFile(name: string, filename: string, mime: string, data: Buffer) {
      parts.push(Buffer.from(`--${boundary}${CRLF}`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}`));
      parts.push(Buffer.from(`Content-Type: ${mime}${CRLF}${CRLF}`));
      parts.push(data);
      parts.push(Buffer.from(CRLF));
    }

    pushField('file_name', fileName);
    pushField('parent_type', 'explorer');
    if (folderToken) pushField('parent_node', folderToken);
    pushField('size', String(size));
    pushFile('file', fileName, 'image/svg+xml', buffer);
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    const body = Buffer.concat(parts);

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    };
    const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
    if (envToken) headers['Authorization'] = `Bearer ${envToken}`;

    const res = await context.fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_all', {
      method: 'POST',
      headers,
      body,
    });
    const text = await res.text();
    const json = JSON.parse(text || '{}');
    const token = json?.data?.file_token || json?.data?.data?.file_token || json?.data?.data?.token;
    if (json?.code === 0 && token) {
      return token as string;
    }
    console.log('====upload_error', text);
    return null;
  } catch (e) {
    console.log('====upload_exception', String(e));
    return null;
  }
}

async function uploadToPublicStorage(buffer: Buffer, fileName: string, context: any): Promise<string | null> {
  try {
    const boundary = `----trae-boundary-${Date.now()}-${Math.random().toString().slice(2)}`;
    const CRLF = '\r\n';
    const parts: Buffer[] = [];
    function pushFile(name: string, filename: string, mime: string, data: Buffer) {
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
    if (url.startsWith('http')) return url;
    return null;
  } catch (e) {
    return null;
  }
}

type TosCred = { accessKeyId: string; accessKeySecret: string; bucket: string; region: string };

function normalizeRegion(r: string): { region: string; endpoint: string; host: string } {
  const raw = (r || '').trim().toLowerCase();
  const region = raw.replace(/^tos-/, '').replace(/^oss-/, '');
  const endpoint = `tos-${region}.volces.com`;
  const host = `tos-${region}.volces.com`;
  return { region, endpoint, host };
}

async function uploadToTOS(buffer: Buffer, fileName: string, cred: TosCred, contentType?: string): Promise<string | null> {
  try {
    const n = normalizeRegion(cred.region);
    const client = new TosClient({ accessKeyId: cred.accessKeyId, accessKeySecret: cred.accessKeySecret, region: n.region, endpoint: n.endpoint });
    const key = `table_images/${fileName}`;
    await client.putObject({ bucket: cred.bucket, key, body: buffer, contentType: contentType || 'application/octet-stream' });
    const url = `https://${cred.bucket}.${n.host}/${key}`;
    return url;
  } catch (e) {
    console.log('====tos_upload_error', String(e));
    return null;
  }
}

export default basekit;
