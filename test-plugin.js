// 测试数据示例
const testData = {
  nutritionFacts: `# header: 项目 | 每份（15毫升） | 营养素参考值%
能量 | 87千焦 | 0.01
蛋白质 | 1.2克 | 0.02
脂肪 | 0克 | 0.0
碳水化合物 | 3.9克 | 0.01
钠 | 1298毫克 | 0.65`,

  simpleTable: `# header: 产品名称 | 价格 | 库存
苹果 | 5.99元/斤 | 100
香蕉 | 3.99元/斤 | 150
橙子 | 6.99元/斤 | 80`,

  invalidFormat: `项目 | 每份（15毫升） | 营养素参考值%
能量 | 87千焦 | 0.01
蛋白质 | 1.2克 | 0.02`,

  emptyData: `# header: 列1 | 列2 | 列3`,
};

// 测试函数
function testTextParsing(textContent) {
  console.log('=== 测试文本解析 ===');
  console.log('输入文本:', textContent);
  
  const lines = textContent.trim().split('\n');
  console.log('行数:', lines.length);
  
  if (lines.length < 2) {
    console.log('结果: 数据不足');
    return;
  }
  
  const headerLine = lines[0];
  if (!headerLine.startsWith('# header:')) {
    console.log('结果: 格式错误 - 缺少标题行标识');
    return;
  }
  
  const headerText = headerLine.replace('# header:', '').trim();
  const headers = headerText.split('|').map(h => h.trim());
  console.log('表头:', headers);
  
  const dataRows = lines.slice(1).map(line => {
    return line.split('|').map(cell => cell.trim());
  });
  console.log('数据行:', dataRows);
  
  console.log('结果: 解析成功');
}

// 运行测试
console.log('=== 营养标签测试 ===');
testTextParsing(testData.nutritionFacts);

console.log('\n=== 简单表格测试 ===');
testTextParsing(testData.simpleTable);

console.log('\n=== 无效格式测试 ===');
testTextParsing(testData.invalidFormat);

console.log('\n=== 空数据测试 ===');
testTextParsing(testData.emptyData);

console.log('\n=== HTML生成预览 ===');
function previewHTMLGeneration(textContent) {
  const lines = textContent.trim().split('\n');
  const headerLine = lines[0];
  const headerText = headerLine.replace('# header:', '').trim();
  const headers = headerText.split('|').map(h => h.trim());
  const dataRows = lines.slice(1).map(line => {
    return line.split('|').map(cell => cell.trim());
  });
  
  // 简化的HTML预览
  let html = '<table border="1" style="border-collapse: collapse;">';
  html += '<thead><tr style="background-color: #f0f0f0;">';
  headers.forEach(header => {
    html += `<th style="padding: 8px; text-align: center;">${header}</th>`;
  });
  html += '</tr></thead>';
  html += '<tbody>';
  dataRows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      html += `<td style="padding: 8px; text-align: center;">${cell}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  
  console.log('生成的HTML预览:');
  console.log(html);
}

previewHTMLGeneration(testData.nutritionFacts);