# Text to Table Image Field Shortcut Specification

## Purpose & User Problem
Create a field shortcut plugin that takes text input in a specific format and renders it as a formatted table image, similar to the nutrition facts table shown in the example.

## Success Criteria
- [ ] Accept text input with header and data rows separated by newlines
- [ ] Parse the format: `# header: col1 | col2 | col3` followed by data rows
- [ ] Generate a clean, professional table image with:
  - Header row with darker background/bold text (首行加深)
  - Proper column widths based on content
  - Centered text alignment
  - Light gray borders/separators
  - White background
- [ ] Output image size under 10MB
- [ ] Return image URL that can be displayed in the multidimensional table

## Scope & Constraints
**In Scope:**
- Text parsing and table generation
- Image creation with HTML5 Canvas or similar approach
- Proper error handling for invalid input formats
- Support for variable number of columns and rows

**Out of Scope:**
- Complex table styling beyond basic formatting
- Support for images or rich content within cells
- Multi-language text processing beyond basic Unicode support

## Technical Considerations
- Use server-side image generation to ensure consistency
- Implement proper text measurement for dynamic column sizing
- Handle Chinese characters and mixed content properly
- Ensure image generation performance is acceptable
- Add proper domain whitelist for any external services if needed

## Input Format
```
# header: 项目 | 每份（15毫升） | 营养素参考值%
能量 | 87千焦 | 0.01
蛋白质 | 1.2克 | 0.02
脂肪 | 0克 | 0.0
碳水化合物 | 3.9克 | 0.01
钠 | 1298毫克 | 0.65
```

## Output Format
Return a FieldCode.Success with data containing:
- `id`: Unique identifier for the result
- `imageUrl`: URL of the generated table image
- `tableData`: Parsed table structure for verification

## Error Handling
- Invalid input format: Return FieldCode.Error with appropriate message
- Image generation failure: Return FieldCode.Error
- Empty input: Return FieldCode.Success with empty result