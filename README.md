# 使用说明
- 安装依赖：`npm install`
- 本地启动：`npm start`
- 本地调试执行函数：`npm run dev`
- 构建：`npm run build`
- 打包发布：`npm run pack`（生成 `output/output.zip`）

# 字段捷径使用
- 在表格中添加并打开本字段捷径
- 处理方式（SingleSelect）：
  - 附件 → 上传至存储并返回链接（支持飞书附件直链或 token 下载后再转存）
  - 文本 → 生成表格图片并上传，返回下载链接（默认）
- 存储服务（Radio）：`阿里云OSS` 或 `火山引擎TOS`，默认 `阿里云OSS`
- 对象存储参数（必填）：`AccessKeyId`、`AccessKeySecret`、`Bucket`、`Region`
- 待生成的字段（FieldSelect）：可选择“文本字段”或“附件字段”
  - 当选择“文本 → 生成表格图片并上传，返回下载链接”时请选择“文本字段”
  - 当选择“附件 → 上传至存储并返回链接”时请选择“附件字段”
- 文件名称（可选，FieldSelect）：选择一个“文本/公式字段”作为文件名，系统会自动追加 `-时间戳`
- 文本格式（用于生成表格图片）：
  - 第一行（表头）：`# header: 列1 | 列2 | 列3`（也可直接写 `列1 | 列2 | 列3`）
  - 后续每行：`值1 | 值2 | 值3`
- 空行会自动删除；表头居中显示；单元格文本自动换行且不截断
- 执行后生成 PNG 并上传至所选存储（OSS/TOS），返回图片链接写入单元格（建议使用“超链接字段”）

# 存储选择与参数
- 默认优先使用 `阿里云OSS`；未选择时执行逻辑也会兜底走 OSS
- Region 示例：
  - OSS：`oss-cn-beijing` 或 `cn-beijing`
  - TOS：`cn-beijing`
- Endpoint 说明：
  - OSS 按 Region 自动生成 `oss-<region>.aliyuncs.com`
  - TOS 按 Region 自动生成 `tos-<region>.volces.com`

# 渲染与清晰度
- 采用矢量绘制并 2x 缩放生成 PNG，文字边缘更锐利
- 列宽按文本像素估算，最小 160px、最大 720px，避免拥挤导致模糊
- 线条加粗到 1.25px，整体更清晰

# 环境兼容性
- 运行环境为 Node.js FaaS（按行执行），依赖均为跨平台实现：`@resvg/resvg-js`、`@volcengine/tos-sdk`、`ali-oss`
- 返回类型为文本链接（`FieldType.Text`），适配“超链接字段”写入
- 域名白名单：已内置 `aliyuncs.com`、`volces.com`、`internal-api-drive-stream.feishu.cn`（用于飞书附件临时链接下载）

# 验证 OSS SDK
- 查看安装版本：`npm list ali-oss`
- 期望显示：`ali-oss@6.x.x`