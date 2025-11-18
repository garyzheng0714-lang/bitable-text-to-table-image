import { basekit, FieldType, field, FieldComponent, FieldCode } from '@lark-opdev/block-basekit-server-api';
import { TosClient } from '@volcengine/tos-sdk';
import OSS from 'ali-oss';

const storageRadio: any = {
  key: 'storage',
  label: '存储服务',
  component: FieldComponent.Radio,
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
const processSelect: any = {
  key: 'processType',
  label: '处理方式',
  component: FieldComponent.SingleSelect,
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
import { Resvg } from '@resvg/resvg-js';
const { t } = field;

const feishuDm = ['feishu.cn', 'open.feishu.cn', 'feishucdn.com', 'larksuitecdn.com', 'larksuite.com', 'internal-api-drive-stream.feishu.cn', 'aliyuncs.com', 'volces.com'];
// 通过addDomainList添加请求接口的域名，不可写多个addDomainList，否则会被覆盖
basekit.addDomainList(feishuDm);

basekit.addField({
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
    processSelect,
    {
      key: 'sourceTextField',
      label: t('textInput'),
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text, FieldType.Attachment],
        placeholder: '可选择文本或附件字段；与上方“处理方式”保持一致'
      },
      validator: { required: true }
    },
    {
      key: 'nameField',
      label: '文件名称',
      component: FieldComponent.FieldSelect,
      props: {
        supportType: [FieldType.Text],
        placeholder: '可选，选择文本/公式字段作为文件名（非附件）'
      }
    },
  ],
  // 定义捷径的返回结果类型
  resultType: {
    type: FieldType.Text,
  },
  // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems
  execute: async (formItemParams: { storage?: any; accessKeyId: string; accessKeySecret: string; bucket: string; region: string; processType?: any; nameField?: any; sourceTextField: any }, context) => {
    const { storage, accessKeyId = '', accessKeySecret = '', bucket = '', region = '', processType = 'TEXT_TABLE_IMAGE', nameField = undefined, sourceTextField = '' } = formItemParams;
    
    /** 为方便查看日志，使用此方法替代console.log */
    function debugLog(arg: any) {
      console.log(JSON.stringify({
        formItemParams,
        context,
        arg
      }))
    }

    try {
      const selectedType = inferFieldValueType(sourceTextField);
      const pType = normalizeProcessType(processType);
      debugLog({ '===0 分支选择': { processType: pType, selectedType } });
      if (pType === 'ATTACHMENT_LINK') {
        if (selectedType !== 'attachment') {
          return { code: FieldCode.ConfigError };
        }
        if (!accessKeyId || !accessKeySecret || !bucket || !region) {
          return { code: FieldCode.ConfigError };
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
          let keyName: string;
          if (baseName) {
            const withExt = ensureExt(baseName, ext || '');
            keyName = appendTimestamp(withExt, ts);
          } else if (fetched.filename) {
            const withExt = ensureExt(fetched.filename, ext || '');
            keyName = appendTimestamp(withExt, ts);
          } else {
            keyName = `attachment-${Date.now()}${ext || ''}`;
          }
          const url = useOSS
            ? await uploadToOSS(fetched.buffer, keyName, { accessKeyId, accessKeySecret, bucket, region }, fetched.contentType || 'application/octet-stream')
            : await uploadToTOS(fetched.buffer, keyName, { accessKeyId, accessKeySecret, bucket, region }, fetched.contentType || 'application/octet-stream');
          if (url) {
            return { code: FieldCode.Success, data: url };
          }
        }
        const fallback = await extractAttachmentDownloadUrl(sourceTextField, context);
        if (fallback) {
          return { code: FieldCode.Success, data: fallback };
        }
        return { code: FieldCode.Error };
      }

      if (selectedType !== 'text') {
        return { code: FieldCode.ConfigError };
      }
      const input = normalizeTextContent(sourceTextField);
      const lines = input.trim().split('\n');
      if (lines.length < 2) {
        return { code: FieldCode.Error };
      }
      const rawHeader = lines[0];
      const headerText = rawHeader.startsWith('# header:') ? rawHeader.replace('# header:', '').trim() : rawHeader.trim();
      if (!headerText.includes('|')) {
        return { code: FieldCode.Error };
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
        return { code: FieldCode.ConfigError };
      }
      const useOSS = isOSSSelected(storage);
      debugLog({ '===4 上传参数': { useOSS, fileName, bucket, region } });
      const url = useOSS
        ? await uploadToOSS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png')
        : await uploadToTOS(pngBuffer, fileName, { accessKeyId, accessKeySecret, bucket, region }, 'image/png');
      if (url) {
        return { code: FieldCode.Success, data: url };
      }
      debugLog({ '===5 上传失败': { useOSS, fileName, bucket, region } });
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

function inferFieldValueType(value: any): 'text' | 'attachment' {
  function hasFileIndicators(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.file_token || obj.token || obj.fileToken) return true;
    if (obj.url || obj.tmp_url || obj.file_url || obj.download_url || obj.downloadUrl || obj.link) return true;
    return false;
  }
  if (Array.isArray(value)) {
    const arr = value as any[];
    const hasFile = arr.some((v) => hasFileIndicators(v));
    const hasText = arr.some((v) => typeof v === 'string' || (v && typeof v === 'object' && 'text' in v));
    if (hasFile) return 'attachment';
    if (hasText) return 'text';
    return 'text';
  }
  if (typeof value === 'string') return 'text';
  if (value && typeof value === 'object') {
    if ('text' in value) return 'text';
    if (hasFileIndicators(value)) return 'attachment';
  }
  return 'text';
}

function normalizeProcessType(v: any): 'ATTACHMENT_LINK' | 'TEXT_TABLE_IMAGE' {
  const s = typeof v === 'object' ? String(v?.value ?? v?.name ?? v?.label ?? '') : String(v ?? '');
  if (/ATTACHMENT/i.test(s) || /附件/.test(s)) return 'ATTACHMENT_LINK';
  return 'TEXT_TABLE_IMAGE';
}

function normalizeSingleSelectValue(value: any): string {
  if (Array.isArray(value)) {
    let acc = '';
    for (const item of value) {
      if (typeof item === 'string') acc += item;
      else if (item && typeof item === 'object') {
        const v = (item?.name ?? item?.label ?? item?.text ?? item?.value ?? '') as string;
        acc += String(v || '');
      }
    }
    return acc.trim();
  }
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const v = (value?.name ?? value?.label ?? value?.text ?? value?.value ?? '') as string;
    return String(v || '').trim();
  }
  return '';
}

function sanitizeFileName(name: string): string {
  const n = String(name || '').trim();
  if (!n) return '';
  const s = n.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return s.slice(0, 80);
}

function getExtFromFilename(name: string): string {
  const n = String(name || '');
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(n);
  return m ? `.${m[1].toLowerCase()}` : '';
}

function extFromContentType(ct: string): string {
  const c = String(ct || '').toLowerCase();
  if (c.includes('image/png')) return '.png';
  if (c.includes('image/jpeg')) return '.jpg';
  if (c.includes('image/jpg')) return '.jpg';
  if (c.includes('image/webp')) return '.webp';
  if (c.includes('image/gif')) return '.gif';
  if (c.includes('application/pdf')) return '.pdf';
  if (c.includes('text/plain')) return '.txt';
  return '';
}

function ensureExt(base: string, ext: string): string {
  const b = String(base || '');
  const e = String(ext || '');
  if (!e) return b;
  if (/\.[a-z0-9]{1,8}$/i.test(b)) return b;
  return `${b}${e}`;
}

function appendTimestamp(name: string, ts: string): string {
  const n = String(name || '');
  const t = String(ts || '');
  if (!t) return n;
  const idx = n.lastIndexOf('.');
  if (idx > 0) return `${n.slice(0, idx)}${t}${n.slice(idx)}`;
  return `${n}${t}`;
}

async function resolveFeishuDownloadUrlByToken(token: string, context: any): Promise<string | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
    if (envToken) headers['Authorization'] = `Bearer ${envToken}`;
    const res = await context.fetch('https://open.feishu.cn/open-apis/drive/v1/files/get_download_url', {
      method: 'POST',
      headers,
      body: JSON.stringify({ file_token: token })
    });
    const text = await res.text();
    const json = JSON.parse(text || '{}');
    const url = json?.data?.download_url || json?.data?.downloadUrl || json?.download_url || '';
    if (typeof url === 'string' && url.startsWith('http')) return url;
    return null;
  } catch (e) {
    return null;
  }
}

async function extractAttachmentDownloadUrl(value: any, context: any): Promise<string | null> {
  const items = Array.isArray(value) ? value : [value];
  for (const it of items) {
    const o = it || {};
    const direct = (o as any).url || (o as any).download_url || (o as any).downloadUrl || (o as any).file_url || (o as any).link;
    if (typeof direct === 'string' && direct.startsWith('http')) return direct as string;
    const token = (o as any).file_token || (o as any).token || (o as any).fileToken;
    if (typeof token === 'string' && token) {
      const url = await resolveFeishuDownloadUrlByToken(token, context);
      if (url) return url;
    }
  }
  return null;
}

function pickFirstAttachment(value: any): any {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function guessFileNameFromAttachment(att: any, url: string | null): string {
  const n = (att?.file_name ?? att?.name ?? att?.filename ?? '') as string;
  if (n && typeof n === 'string' && n.trim().length) return n.trim();
  const u = String(url || '');
  const m = /\/([^\/?#]+)(?:\?|#|$)/.exec(u);
  if (m && m[1]) return m[1];
  return `attachment_${Date.now()}`;
}

function authHeadersForUrl(u: string): Record<string, string> {
  try {
    const url = new URL(u);
    const host = url.hostname || '';
    const envToken = process.env.FEISHU_TENANT_ACCESS_TOKEN || process.env.TENANT_ACCESS_TOKEN || '';
    if (envToken && (/feishu\.cn$/.test(host) || /larksuite\.com$/.test(host) || /larksuitecdn\.com$/.test(host) || /open\.feishu\.cn$/.test(host))) {
      return { Authorization: `Bearer ${envToken}` };
    }
  } catch {}
  return {};
}

async function fetchBufferFromUrl(u: string, context: any): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  try {
    const headers = authHeadersForUrl(u);
    const res = await context.fetch(u, { method: 'GET', headers });
    const ct = (res.headers?.get?.('content-type') || 'application/octet-stream') as string;
    const cd = res.headers?.get?.('content-disposition') || '';
    let filename = '';
    const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
    if (m) filename = decodeURIComponent(m[1] || m[2] || '');
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return { buffer: buf, contentType: ct, filename: filename || '' };
  } catch (e) {
    return null;
  }
}

async function fetchAttachmentBuffer(value: any, context: any): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  const att = pickFirstAttachment(value);
  const direct = (att?.url || att?.tmp_url || att?.download_url || att?.downloadUrl || att?.file_url || att?.link) as string | undefined;
  if (direct && typeof direct === 'string' && direct.startsWith('http')) {
    const fetched = await fetchBufferFromUrl(direct, context);
    if (fetched) {
      return { buffer: fetched.buffer, contentType: fetched.contentType, filename: fetched.filename || guessFileNameFromAttachment(att, direct) };
    }
  }
  const token = (att?.file_token || att?.token || att?.fileToken) as string | undefined;
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
  return renderTablePNG(headers, rows);
}

async function renderTableWebP(headers: string[], rows: string[][]): Promise<Buffer> {
  const svg = generateRichSVG(headers, rows);
  const resvg = new Resvg(svg, { background: 'white', fitTo: { mode: 'zoom', value: 2 } });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

async function renderTablePNG(headers: string[], rows: string[][]): Promise<Buffer> {
  const svg = generateRichSVG(headers, rows);
  const resvg = new Resvg(svg, { background: 'white', fitTo: { mode: 'zoom', value: 2 } });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
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
type OssCred = { accessKeyId: string; accessKeySecret: string; bucket: string; region: string };

function isOSSSelected(storage: any): boolean {
  if (storage == null) return true;
  if (typeof storage === 'string') return storage === 'OSS' || storage === '阿里云OSS' || /OSS/i.test(storage);
  if (typeof storage === 'object') {
    const v = (storage?.value ?? storage?.name ?? '').toString();
    return v === 'OSS' || v === '阿里云OSS' || /OSS/i.test(v);
  }
  return false;
}

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

function normalizeOssRegion(r: string): { region: string; endpoint: string; host: string } {
  const raw = (r || '').trim().toLowerCase();
  const region = raw.replace(/^oss-/, '').replace(/^tos-/, '');
  const endpoint = `oss-${region}.aliyuncs.com`;
  const host = `oss-${region}.aliyuncs.com`;
  return { region, endpoint, host };
}

async function uploadToOSS(buffer: Buffer, fileName: string, cred: OssCred, contentType?: string): Promise<string | null> {
  try {
    const n = normalizeOssRegion(cred.region);
    const client = new OSS({ region: `oss-${n.region}`, accessKeyId: cred.accessKeyId, accessKeySecret: cred.accessKeySecret, bucket: cred.bucket, endpoint: `https://${n.endpoint}` });
    const key = `table_images/${fileName}`;
    await client.put(key, buffer, { headers: { 'Content-Type': contentType || 'application/octet-stream' } });
    const url = `https://${cred.bucket}.${n.host}/${key}`;
    return url;
  } catch (e) {
    console.log('====oss_upload_error', String(e));
    return null;
  }
}

export default basekit;
