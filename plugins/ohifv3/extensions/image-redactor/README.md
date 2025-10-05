# OHIF Image Redactor Extension

A comprehensive image redaction extension for the OHIF Viewer that allows users to manually redact sensitive areas in medical images by drawing rectangles and burning pixels.

## Features

- **Rectangle Drawing Tool**: Draw redaction rectangles on images using an intuitive interface
- **Multiple Redaction Areas**: Select and manage multiple areas before applying redaction
- **Pixel Burning**: Permanently redact pixels by setting them to black (or configurable color)
- **Undo Functionality**: Restore original image data if needed
- **Export Capability**: Export redacted images as PNG files
- **Real-time Preview**: Visual feedback with dashed rectangles and semi-transparent overlays
- **Confirmation Dialog**: Safety confirmation before applying permanent changes

## Installation

1. Copy this extension to your OHIF extensions directory
2. Add the extension to your OHIF mode configuration
3. Include the extension in your viewer's extension dependencies

## Usage

### Basic Workflow

1. **Activate Tool**: Click "Activate Redaction Tool" to enable rectangle drawing
2. **Draw Areas**: Click and drag to draw rectangles over areas to redact
3. **Review**: Check the list of redaction areas in the panel
4. **Apply**: Click "Apply Redaction" and confirm to burn the pixels
5. **Export**: Use "Export Redacted Image" to download the result

### Panel Controls

- **Activate/Deactivate Tool**: Toggle the redaction rectangle drawing tool
- **Clear All Areas**: Remove all drawn redaction rectangles
- **Apply Redaction**: Permanently redact the selected areas
- **Undo Redaction**: Restore the original image data
- **Export Image**: Download the redacted image as PNG

### Tool Features

- **Visual Feedback**: Redaction areas are shown with red dashed borders and semi-transparent fill
- **Area Labels**: Each redaction area is labeled "REDACTION AREA"
- **Coordinate Tracking**: Precise pixel-level coordinate extraction
- **Multi-format Support**: Works with various image formats (8-bit, 16-bit, float)

## Technical Details

### Components

- **RedactionRectangleTool**: Custom Cornerstone.js tool extending RectangleROITool
- **RedactionService**: Service for managing redaction operations and pixel manipulation
- **RedactionPanel**: React UI component for user interaction
- **Commands Module**: OHIF commands for programmatic control

### Integration

The extension integrates with OHIF's:
- Tool system (Cornerstone.js tools)
- Panel system (right/left panel modules)
- Command system (for toolbar buttons and shortcuts)
- Viewport system (for image manipulation)

### Data Flow

1. User draws rectangles using RedactionRectangleTool
2. Coordinates are stored as Cornerstone annotations
3. RedactionService converts world coordinates to pixel coordinates
4. Pixel data is modified directly in the image cache
5. Rendering engine updates the display

## Configuration

The extension can be configured with:

```javascript
{
  customColor: 'rgb(255, 0, 0)', // Redaction area color
  lineWidth: 2,                  // Border line width
  lineDash: [5, 5],             // Dashed line pattern
}
```

## API

### Commands

- `activateRedactionTool`: Enable the redaction drawing tool
- `deactivateRedactionTool`: Disable the redaction drawing tool
- `applyRedaction`: Apply redaction to all drawn areas
- `undoRedaction`: Restore original image data
- `clearRedactionAreas`: Remove all redaction rectangles
- `exportRedactedImage`: Export the current image as PNG

### Service Methods

- `getRedactionAreas(viewportId, element)`: Get all redaction areas
- `applyRedaction(viewportId, viewport, areas)`: Apply pixel burning
- `undoRedaction(viewportId, viewport)`: Restore original pixels
- `exportRedactedImage(viewportId, viewport)`: Export image data

## Security Considerations

- **Permanent Modification**: Applied redactions modify the original image data
- **Undo Limitations**: Undo is only available until the next redaction operation
- **Export Only**: Consider implementing server-side redaction for production use
- **Metadata**: This extension only redacts image pixels, not DICOM metadata

## Browser Compatibility

- Modern browsers with Canvas API support
- WebGL support recommended for optimal performance
- File download API for export functionality

## License

OHIF Image Redactor Extension Copyright (2025) Databricks, Inc.
Author: Emanuele Rinaldi <emanuele.rinaldi@databricks.com>

This software is licensed under the Databricks License Agreement. See the full license text at:
https://raw.githubusercontent.com/databricks-industry-solutions/pixels/refs/heads/main/LICENSE

This library may not be used except in connection with the Licensee's use of the Databricks Platform Services pursuant to an Agreement between Licensee and Databricks, Inc.
