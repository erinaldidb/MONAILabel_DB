/*
OHIF Image Redactor Extension Copyright (2025) Databricks, Inc.
Author: Emanuele Rinaldi <emanuele.rinaldi@databricks.com>

This library (the "Software") may not be used except in connection with the Licensee's use of the Databricks Platform Services pursuant to an Agreement (defined below) between Licensee (defined below) and Databricks, Inc. ("Databricks"). The Object Code version of the Software shall be deemed part of the Downloadable Services under the Agreement, or if the Agreement does not define Downloadable Services, Subscription Services, or if neither are defined then the term in such Agreement that refers to the applicable Databricks Platform Services (as defined below) shall be substituted herein for "Downloadable Services." Licensee's use of the Software must comply at all times with any restrictions applicable to the Downlodable Services and Subscription Services, generally, and must be used in accordance with any applicable documentation. For the avoidance of doubt, the Software constitutes Databricks Confidential Information under the Agreement. Additionally, and notwithstanding anything in the Agreement to the contrary:
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* you may view, make limited copies of, and may compile the Source Code version of the Software into an Object Code version of the Software. For the avoidance of doubt, you may not make derivative works of Software (or make any any changes to the Source Code version of the unless you have agreed to separate terms with Databricks permitting such modifications (e.g., a contribution license agreement)).
If you have not agreed to an Agreement or otherwise do not agree to these terms, you may not use the Software or view, copy or compile the Source Code of the Software. This license terminates automatically upon the termination of the Agreement or Licensee's breach of these terms. Additionally, Databricks may terminate this license at any time on notice. Upon termination, you must permanently delete the Software and all copies thereof (including the Source Code).
*/

import { RectangleROITool, annotation, Enums } from '@cornerstonejs/tools';

const { getAnnotations } = annotation.state;

/**
 * RedactionRectangleTool - A custom tool for marking areas to be redacted
 * Extends RectangleROITool with custom styling for redaction visualization
 */
export default class RedactionRectangleTool extends RectangleROITool {
  static toolName = 'RedactionRectangle';

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        getTextLines: (data, targetId) => {
          return [];
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Override getStyle to apply red color when highlighted
   */
  getStyle(property, specs, annotation) {
    // Check if this annotation is highlighted
    const isHighlighted = annotation?.metadata?.highlighted;
    
    if (isHighlighted && property === 'color') {
      return 'rgb(255, 0, 0)'; // Red when highlighted
    }
    
    if (isHighlighted && property === 'lineWidth') {
      return 3; // Thicker when highlighted
    }
    
    // Fall back to parent implementation
    return super.getStyle(property, specs, annotation);
  }

  /**
   * Get the coordinates of all redaction rectangles in world coordinates
   */
  static getRedactionAreas(element) {
    const annotations = getAnnotations(RedactionRectangleTool.toolName, element);
    if (!annotations?.length) {
      return [];
    }

    return annotations.map((annotation) => {
      const { points } = annotation.data.handles;
      
      // RectangleROI stores 4 corner points
      // Extract all X, Y, Z coordinates to find the bounding box
      const allX = points.map(p => p[0]);
      const allY = points.map(p => p[1]);
      const z = points[0][2]; // All points have the same Z coordinate
      
      // Calculate actual top-left and bottom-right from all corner points
      const topLeft = [
        Math.min(...allX),
        Math.min(...allY),
        z,
      ];
      
      const bottomRight = [
        Math.max(...allX),
        Math.max(...allY),
        z,
      ];
      
      return {
        annotationUID: annotation.annotationUID,
        topLeft: topLeft,
        bottomRight: bottomRight,
        worldCoordinates: points,
      };
    });
  }

  /**
   * Convert world coordinates to image pixel coordinates
   */
  static worldToPixelCoordinates(worldCoords, viewport) {
    return worldCoords.map((coord) => {
      const canvasCoord = viewport.worldToCanvas(coord);
      // Canvas coordinates are already in pixel space for 2D viewports
      // Just return the canvas coordinates as pixel coordinates
      return [Math.round(canvasCoord[0]), Math.round(canvasCoord[1])];
    });
  }

  /**
   * Clear all redaction areas
   */
  static clearAllRedactionAreas(element) {
    const annotationManager = annotation.state.getAnnotationManager();
    let annotations = getAnnotations(RedactionRectangleTool.toolName, element);
    
    if (annotations?.length) {
      // Create a copy of the array to avoid modification during iteration
      const annotationsCopy = [...annotations];
      
      // Remove all annotations
      annotationsCopy.forEach((ann) => {
        try {
          annotationManager.removeAnnotation(ann.annotationUID);
        } catch (error) {
          console.error('Error removing annotation:', error);
        }
      });
      
      // Double-check and remove any remaining annotations
      annotations = getAnnotations(RedactionRectangleTool.toolName, element);
      if (annotations?.length) {
        annotations.forEach((ann) => {
          try {
            annotationManager.removeAnnotation(ann.annotationUID);
          } catch (error) {
            console.error('Error removing remaining annotation:', error);
          }
        });
      }
      
      // Force re-render
      element.dispatchEvent(new CustomEvent('annotationsCleared'));
    }
  }

  /**
   * Delete a single redaction area by annotation UID
   */
  static deleteRedactionArea(annotationUID, element) {
    const annotationManager = annotation.state.getAnnotationManager();
    annotationManager.removeAnnotation(annotationUID);
    
    // Trigger re-render
    element.dispatchEvent(new CustomEvent('annotationRemoved', {
      detail: { annotationUID }
    }));
  }

  /**
   * Highlight a specific redaction area by setting metadata flag
   * The getStyle() method will read this flag and apply red color
   */
  static highlightRedactionArea(annotationUID, element, highlight = true) {
    const annotations = getAnnotations(RedactionRectangleTool.toolName, element);
    const targetAnnotation = annotations?.find(ann => ann.annotationUID === annotationUID);
    
    if (targetAnnotation) {
      // Store highlight state in metadata
      // The getStyle() method will read this and apply red color
      if (!targetAnnotation.metadata) {
        targetAnnotation.metadata = {};
      }
      
      targetAnnotation.metadata.highlighted = highlight;
    }
  }
}
