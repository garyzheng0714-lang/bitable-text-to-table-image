# 使用说明
- 安装依赖：`npm install`
- 本地启动：`npm start`
- 本地调试执行函数：`npm run dev`
- 构建：`npm run build`
- 打包发布：`npm run pack`（生成 `output/output.zip`）

# 字段捷径使用
- 在表格中添加并打开本字段捷径
- 填写对象存储参数：`AccessKeyId`、`AccessKeySecret`、`Bucket`、`Region`
- 选择文本源字段（支持文本类型），文本格式：
  - 第一行：`# header: 列1 | 列2 | 列3`
  - 后续每行：`值1 | 值2 | 值3`
- 空行会自动删除；表头固定单行居中显示；单元格文本自动换行且不截断
- 执行后生成表格图片（PNG），上传至 TOS，返回图片链接并写入单元格（超链接字段建议使用）

# 渲染与清晰度
- 采用矢量绘制并 2x 缩放生成 PNG，文字边缘更锐利
- 列宽按文本像素估算，最小 160px、最大 720px，避免拥挤导致模糊
- 线条加粗到 1.25px，整体更清晰

# 环境兼容性
- 运行环境为 Node.js FaaS（按行执行），依赖均为跨平台实现：`@resvg/resvg-js`、`@volcengine/tos-sdk`
- 返回类型为文本链接（`FieldType.Text`），适配“超链接字段”写入
- TOS 访问域名：`tos-<region>.volces.com`