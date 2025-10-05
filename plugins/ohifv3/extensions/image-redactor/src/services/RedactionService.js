/*
OHIF Image Redactor Extension Copyright (2025) Databricks, Inc.
Author: Emanuele Rinaldi <emanuele.rinaldi@databricks.com>

This library (the "Software") may not be used except in connection with the Licensee's use of the Databricks Platform Services pursuant to an Agreement (defined below) between Licensee (defined below) and Databricks, Inc. ("Databricks"). The Object Code version of the Software shall be deemed part of the Downloadable Services under the Agreement, or if the Agreement does not define Downloadable Services, Subscription Services, or if neither are defined then the term in such Agreement that refers to the applicable Databricks Platform Services (as defined below) shall be substituted herein for "Downloadable Services." Licensee's use of the Software must comply at all times with any restrictions applicable to the Downlodable Services and Subscription Services, generally, and must be used in accordance with any applicable documentation. For the avoidance of doubt, the Software constitutes Databricks Confidential Information under the Agreement. Additionally, and notwithstanding anything in the Agreement to the contrary:
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* you may view, make limited copies of, and may compile the Source Code version of the Software into an Object Code version of the Software. For the avoidance of doubt, you may not make derivative works of Software (or make any any changes to the Source Code version of the unless you have agreed to separate terms with Databricks permitting such modifications (e.g., a contribution license agreement)).
If you have not agreed to an Agreement or otherwise do not agree to these terms, you may not use the Software or view, copy or compile the Source Code of the Software. This license terminates automatically upon the termination of the Agreement or Licensee's breach of these terms. Additionally, Databricks may terminate this license at any time on notice. Upon termination, you must permanently delete the Software and all copies thereof (including the Source Code).
*/

import { cache, utilities, metaData } from '@cornerstonejs/core';
import RedactionRectangleTool from '../tools/RedactionRectangleTool';
import { RedactionAreaManager } from '../models/RedactionArea';

class RedactionService {
  constructor() {
    this.areaManager = new RedactionAreaManager(); // Centralized area management
    this.redactionHistory = new Map(); // Store original pixel data for undo
    this.viewportManagers = new Map(); // Map<viewportId, RedactionAreaManager>
  }

  /**
   * Get or create area manager for a viewport
   */
  getAreaManager(viewportId) {
    if (!this.viewportManagers.has(viewportId)) {
      this.viewportManagers.set(viewportId, new RedactionAreaManager());
    }
    return this.viewportManagers.get(viewportId);
  }

  /**
   * Get all redaction areas for a viewport
   * @param {string} viewportId - The viewport ID
   * @param {HTMLElement} element - The viewport element
   * @param {number} frameIndex - Current frame index
   * @param {boolean} isGlobal - Whether areas should be global (apply to all frames)
   */
  getRedactionAreas(viewportId, element, frameIndex = 0, isGlobal = false) {
    const areas = RedactionRectangleTool.getRedactionAreas(element);
    
    // Add frame index to each area
    const areasWithFrame = areas.map(area => ({
      ...area,
      frameIndex: isGlobal ? null : frameIndex,
      isGlobal: isGlobal
    }));
    
    // Store based on global or frame-specific
    if (isGlobal) {
      this.globalRedactionAreas = areasWithFrame;
    } else {
      // Initialize viewport map if needed
      if (!this.frameSpecificAreas.has(viewportId)) {
        this.frameSpecificAreas.set(viewportId, new Map());
      }
      
      // Store current frame's areas
      const viewportFrames = this.frameSpecificAreas.get(viewportId);
      viewportFrames.set(frameIndex, areasWithFrame);
    }
    
    // Store current frame areas for quick access
    this.redactionAreas.set(viewportId, areasWithFrame);
    return areasWithFrame;
  }

  /**
   * Get all frame-specific redaction areas across all frames
   * @param {string} viewportId - The viewport ID
   * @returns {Array} All redaction areas from all frames
   */
  getAllFrameSpecificAreas(viewportId) {
    const manager = this.getAreaManager(viewportId);
    return manager.getAllAreas().map(area => ({
      annotationUID: area.annotationUID,
      topLeft: area.topLeft,
      bottomRight: area.bottomRight,
      worldCoordinates: area.worldCoordinates,
      frameIndex: area.frameIndex,
      isGlobal: area.isGlobal
    }));
  }

  /**
   * Check if a specific frame has stored redaction areas
   * @param {string} viewportId - The viewport ID
   * @param {number} frameIndex - The frame index to check
   * @returns {boolean} True if frame has stored areas
   */
  hasFrameAreas(viewportId, frameIndex) {
    const manager = this.getAreaManager(viewportId);
    return manager.getAreasForFrame(frameIndex).length > 0;
  }

  /**
   * Get stored redaction areas for a specific frame
   * @param {string} viewportId - The viewport ID
   * @param {number} frameIndex - The frame index
   * @returns {Array} Stored areas for the frame
   */
  getStoredFrameAreas(viewportId, frameIndex) {
    const manager = this.getAreaManager(viewportId);
    return manager.getAreasForFrame(frameIndex).map(area => ({
      annotationUID: area.annotationUID,
      topLeft: area.topLeft,
      bottomRight: area.bottomRight,
      worldCoordinates: area.worldCoordinates,
      frameIndex: area.frameIndex,
      isGlobal: area.isGlobal
    }));
  }

  /**
   * Store specific redaction areas for a frame (without reading from element)
   * @param {string} viewportId - The viewport ID
   * @param {object} viewport - The viewport object
   * @param {Array} areas - The areas to store
   * @param {number} frameIndex - The frame index
   * @param {boolean} isGlobal - Whether areas should be global
   */
  storeSpecificAreas(viewportId, viewport, areas, frameIndex, isGlobal = false) {
    const manager = this.getAreaManager(viewportId);
    
    areas.forEach(annotationData => {
      manager.addArea(annotationData, viewport, frameIndex, isGlobal);
    });
    
    const stats = manager.getStats();
    console.log(`Stored ${areas.length} areas for frame ${frameIndex}. Total areas: ${stats.totalAreas}, Frames: ${stats.framesWithAreas}`);
    
    return areas;
  }

  /**
   * Update redaction areas for a specific frame
   * Checks each annotation and updates only if coordinates changed
   * @param {string} viewportId - The viewport ID
   * @param {object} viewport - The viewport object
   * @param {Array} areas - The current areas from viewport
   * @param {number} frameIndex - The frame index
   * @param {boolean} isGlobal - Whether areas should be global
   */
  updateFrameAreas(viewportId, viewport, areas, frameIndex, isGlobal = false) {
    const manager = this.getAreaManager(viewportId);
    
    let updatedCount = 0;
    areas.forEach(annotationData => {
      if (manager.hasAreaChanged(annotationData.annotationUID, annotationData)) {
        manager.updateArea(annotationData.annotationUID, annotationData);
        updatedCount++;
      }
    });
    
    console.log(`Updated ${updatedCount} modified area(s) for frame ${frameIndex}`);
    
    return areas;
  }

  /**
   * Get the frame index for a specific annotation UID
   * @param {string} annotationUID - The annotation UID
   * @param {string} viewportId - The viewport ID
   * @returns {number|null} The frame index or null if not found
   */
  getFrameForAnnotation(viewportId, annotationUID) {
    const manager = this.getAreaManager(viewportId);
    const area = manager.areas.get(annotationUID);
    return area ? area.frameIndex : null;
  }

  /**
   * Convert world coordinates to pixel coordinates for redaction
   */
  worldToPixelBounds(worldCoords, viewport) {
    const pixelCoords = RedactionRectangleTool.worldToPixelCoordinates(worldCoords, viewport);
    
    const [topLeft, bottomRight] = pixelCoords;
    
    return {
      minX: Math.min(topLeft[0], bottomRight[0]),
      maxX: Math.max(topLeft[0], bottomRight[0]),
      minY: Math.min(topLeft[1], bottomRight[1]),
      maxY: Math.max(topLeft[1], bottomRight[1]),
    };
  }

  /**
   * Apply redaction to image pixels (burn pixels to black)
   */
  async applyRedaction(viewportId, viewport, redactionAreas) {
    try {
      // Mark the areas as redacted
      // Note: Actual pixel burning in DICOM would require backend processing
      this.redactionAreas.set(viewportId, redactionAreas);
      
      // Store for undo functionality
      this.redactionHistory.set(viewportId, {
        areas: [...redactionAreas],
        timestamp: Date.now(),
      });

      return {
        success: true,
        redactedAreas: redactionAreas.length,
        message: `Marked ${redactionAreas.length} area(s) for redaction. Use Export to save redacted image.`,
      };

    } catch (error) {
      console.error('Error applying redaction:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Undo redaction by clearing marked areas
   */
  async undoRedaction(viewportId, viewport) {
    try {
      const historyEntry = this.redactionHistory.get(viewportId);
      if (!historyEntry) {
        throw new Error('No redaction history found for this viewport');
      }

      // Clear the redaction areas
      this.redactionAreas.delete(viewportId);
      this.redactionHistory.delete(viewportId);

      return {
        success: true,
        message: 'Redaction marks cleared. Annotations remain for review.',
      };

    } catch (error) {
      console.error('Error undoing redaction:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clear all redaction areas for a viewport
   * @param {string} viewportId - The viewport ID
   * @param {HTMLElement} element - The viewport element
   * @param {boolean} isGlobal - Whether to clear global or frame-specific areas
   */
  clearRedactionAreas(viewportId, element, isGlobal = false) {
    RedactionRectangleTool.clearAllRedactionAreas(element);
    
    const manager = this.getAreaManager(viewportId);
    if (isGlobal) {
      manager.clearGlobal();
    } else {
      manager.clearAll();
    }
  }

  /**
   * Delete a single redaction area by annotation UID
   */
  deleteRedactionArea(viewportId, annotationUID, element) {
    RedactionRectangleTool.deleteRedactionArea(annotationUID, element);
    
    const manager = this.getAreaManager(viewportId);
    manager.removeArea(annotationUID);
  }

  /**
   * Highlight a specific redaction area
   */
  highlightRedactionArea(annotationUID, element, highlight = true) {
    RedactionRectangleTool.highlightRedactionArea(annotationUID, element, highlight);
  }

  /**
   * Get viewport from ID (helper method)
   */
  getViewportFromId(viewportId) {
    // This would need to be implemented based on how OHIF manages viewports
    // For now, return null and handle in the calling code
    return null;
  }

  /**
   * Export redacted image data with redaction areas burned as black rectangles
   * Works directly with the image pixel data, independent of zoom/pan
   */
  async exportRedactedImage(viewportId, viewport, format = 'png') {
    const element = viewport.element;
    const redactionAreas = RedactionRectangleTool.getRedactionAreas(element);
    return this.exportRedactedImageWithAreas(viewportId, viewport, redactionAreas, format);
  }

  /**
   * Export redacted image with specific areas (not from element annotations)
   * @param {string} viewportId - The viewport ID
   * @param {object} viewport - The viewport object
   * @param {Array} redactionAreas - Specific redaction areas to apply
   * @param {string} format - Output format (default 'png')
   */
  async exportRedactedImageWithAreas(viewportId, viewport, redactionAreas, format = 'png') {
    try {
      const element = viewport.element;
      
      // Get the actual image data and worldToIndex function from the viewport
      // This is equivalent to getting the DICOM pixel_array
      const imageId = viewport.getCurrentImageId();
      const image = cache.getImage(imageId);
      
      if (!image) {
        throw new Error('Failed to get image from cache');
      }

      // Get image dimensions from the cached image
      const width = image.width || image.columns;
      const height = image.height || image.rows;
      
      // Get worldToIndex function or create a manual converter
      let worldToIndex = null;
      
      // Try to get worldToIndex from image data
      if (image.imageData?.worldToIndex) {
        worldToIndex = image.imageData.worldToIndex;
      } else if (viewport.getImageData) {
        const imageData = viewport.getImageData();
        worldToIndex = imageData?.worldToIndex;
      }
      
      // If worldToIndex is not available, create a manual converter using image metadata
      if (!worldToIndex) {
        // For stack viewports, get the image plane metadata
        const imagePlaneModule = metaData.get('imagePlaneModule', imageId) || {};
        const imagePositionPatient = imagePlaneModule.imagePositionPatient || [0, 0, 0];
        const imageOrientationPatient = imagePlaneModule.imageOrientationPatient || [1, 0, 0, 0, 1, 0];
        const pixelSpacing = imagePlaneModule.pixelSpacing || imagePlaneModule.rowPixelSpacing 
          ? [imagePlaneModule.rowPixelSpacing || 1, imagePlaneModule.columnPixelSpacing || 1] 
          : [1, 1];
        
        // Build orientation matrix from imageOrientationPatient
        // imageOrientationPatient contains: [rowX, rowY, rowZ, colX, colY, colZ]
        const rowCosines = imageOrientationPatient.slice(0, 3);
        const colCosines = imageOrientationPatient.slice(3, 6);
        
        // Create a worldToIndex function for 2D stack images
        worldToIndex = (worldCoord) => {
          // Calculate the difference from image origin
          const diff = [
            worldCoord[0] - imagePositionPatient[0],
            worldCoord[1] - imagePositionPatient[1],
            worldCoord[2] - imagePositionPatient[2]
          ];
          
          // Project onto row direction (x-axis in image space)
          const indexX = (diff[0] * rowCosines[0] + diff[1] * rowCosines[1] + diff[2] * rowCosines[2]) / pixelSpacing[0];
          
          // Project onto column direction (y-axis in image space)
          const indexY = (diff[0] * colCosines[0] + diff[1] * colCosines[1] + diff[2] * colCosines[2]) / pixelSpacing[1];
          
          return [indexX, indexY, 0];
        };
      }
      
      // Create a canvas to render the redacted image at actual pixel resolution
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Get the raw pixel data from the image (not the rendered viewport)
      // This is the equivalent of pydicom.pixel_array - raw unzoomed, unrotated pixels
      const pixelData = image.getPixelData();
      
      if (!pixelData) {
        throw new Error('Failed to get pixel data from image');
      }
      
      // Get viewport VOI (window/level) settings for proper display
      const voiRange = viewport.getProperties()?.voiRange || {};
      const windowWidth = voiRange.windowWidth || image.windowWidth || 255;
      const windowCenter = voiRange.windowCenter || image.windowCenter || 128;
      
      // Calculate window min/max
      const windowLow = windowCenter - windowWidth / 2;
      const windowHigh = windowCenter + windowWidth / 2;
      
      // Create ImageData from the pixel array
      const imageData = ctx.createImageData(width, height);
      
      // Convert pixel data to RGBA format for canvas with windowing applied
      for (let i = 0; i < pixelData.length; i++) {
        const pixelValue = pixelData[i];
        const offset = i * 4;
        
        // Apply window/level transformation
        let displayValue;
        if (pixelValue <= windowLow) {
          displayValue = 0;
        } else if (pixelValue >= windowHigh) {
          displayValue = 255;
        } else {
          displayValue = ((pixelValue - windowLow) / windowWidth) * 255;
        }
        
        // Clamp to 0-255 range
        displayValue = Math.min(255, Math.max(0, Math.round(displayValue)));
        
        // Set RGBA values (grayscale, so R=G=B)
        imageData.data[offset] = displayValue;     // R
        imageData.data[offset + 1] = displayValue; // G
        imageData.data[offset + 2] = displayValue; // B
        imageData.data[offset + 3] = 255;          // A (fully opaque)
      }
      
      // Put the raw pixel data on the canvas
      ctx.putImageData(imageData, 0, 0);

      if (redactionAreas.length === 0) {
        // No redaction areas, just export the original image
        const dataUrl = exportCanvas.toDataURL(`image/${format}`);
        return {
          success: true,
          dataUrl: dataUrl,
          format: format,
          message: 'No redaction areas found. Draw rectangles with the Redaction tool first.',
        };
      }

      // Draw black rectangles over redaction areas at actual pixel coordinates
      ctx.fillStyle = 'rgba(0, 0, 0, 1.0)'; // Solid black for redaction
      
      redactionAreas.forEach((area) => {
        // Convert world coordinates to image pixel/index coordinates
        const topLeftIndex = worldToIndex(area.topLeft);
        const bottomRightIndex = worldToIndex(area.bottomRight);
        
        // Calculate pixel coordinates (rounding to nearest pixel)
        const x = Math.round(Math.min(topLeftIndex[0], bottomRightIndex[0]));
        const y = Math.round(Math.min(topLeftIndex[1], bottomRightIndex[1]));
        const w = Math.round(Math.abs(bottomRightIndex[0] - topLeftIndex[0]));
        const h = Math.round(Math.abs(bottomRightIndex[1] - topLeftIndex[1]));
        
        // Draw black rectangle at actual pixel coordinates
        if (w > 0 && h > 0) {
          ctx.fillRect(x, y, w, h);
        }
      });

      // Convert to data URL
      const dataUrl = exportCanvas.toDataURL(`image/${format}`);
      
      return {
        success: true,
        dataUrl: dataUrl,
        format: format,
        redactedAreas: redactionAreas.length,
      };
    } catch (error) {
      console.error('Error exporting redacted image:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get redaction statistics
   * @param {string} viewportId - The viewport ID
   * @param {boolean} isGlobal - Whether to include global areas
   */
  getRedactionStats(viewportId, isGlobal = false) {
    const manager = this.getAreaManager(viewportId);
    const allAreas = manager.getAllAreas();
    
    const hasHistory = this.redactionHistory.has(viewportId);
    
    return {
      totalAreas: allAreas.length,
      canUndo: hasHistory,
      areas: allAreas.map((area, index) => ({
        id: index + 1,
        annotationUID: area.annotationUID,
        coordinates: area.worldCoordinates,
        frameIndex: area.frameIndex,
        isGlobal: area.isGlobal,
      })),
    };
  }

  /**
   * Export redaction metadata grouped by file
   * All metadata is already stored in RedactionArea objects
   * @param {string} viewportId - The viewport ID
   * @param {object} viewport - The viewport object
   * @param {HTMLElement} element - The viewport element
   * @param {Array} redactionAreas - Array of redaction areas (not used, kept for compatibility)
   * @param {boolean} isGlobal - Whether redaction applies to all frames
   */
  async exportRedactedDICOM(viewportId, viewport, element, redactionAreas, isGlobal = false) {
    try {
      // Get all RedactionArea objects from the manager
      const manager = this.getAreaManager(viewportId);
      const allAreas = manager.getAllAreas();
      
      if (allAreas.length === 0) {
        throw new Error('No redaction areas to export');
      }
      
      // Group areas by file (sopInstanceUID is unique per file/frame)
      const fileGroups = new Map();
      
      allAreas.forEach(area => {
        const fileKey = area.sopInstanceUID || area.fileName;
        
        if (!fileGroups.has(fileKey)) {
          fileGroups.set(fileKey, {
            // Common file metadata
            fileName: area.fileName,
            filePath: area.filePath,
            imageId: area.imageId,
            studyInstanceUID: area.studyInstanceUID,
            seriesInstanceUID: area.seriesInstanceUID,
            sopInstanceUID: area.sopInstanceUID,
            sopClassUID: area.sopClassUID,
            modality: area.modality,
            numberOfFrames: area.numberOfFrames,
            rows: area.rows,
            columns: area.columns,
            redactionAreas: []
          });
        }
        
        // Add this area to the file's redaction list
        fileGroups.get(fileKey).redactionAreas.push(area.toJSON());
      });
      
      // Convert map to array of file entries
      const files = Array.from(fileGroups.values()).map((fileData, index) => {
        // Group redaction areas by frame index
        const frameGroups = new Map();
        
        fileData.redactionAreas.forEach(area => {
          const frameKey = area.isGlobal ? 'global' : area.frameIndex;
          
          if (!frameGroups.has(frameKey)) {
            frameGroups.set(frameKey, []);
          }
          
          frameGroups.get(frameKey).push({
            topLeft: area.topLeft,
            bottomRight: area.bottomRight,
            worldCoordinates: area.worldCoordinates,
            annotationUID: area.annotationUID,
            timestamp: area.timestamp
          });
        });
        
        // Convert frame groups to array
        const frameRedactions = Array.from(frameGroups.entries()).map(([frameKey, areas]) => ({
          frameIndex: frameKey === 'global' ? null : frameKey,
          isGlobal: frameKey === 'global',
          redactionCount: areas.length,
          redactions: areas.map((area, areaIndex) => ({
            id: areaIndex + 1,
            topLeft: area.topLeft,
            bottomRight: area.bottomRight,
            worldCoordinates: area.worldCoordinates,
            annotationUID: area.annotationUID,
            timestamp: area.timestamp
          }))
        })).sort((a, b) => {
          // Sort: global first, then by frame index
          if (a.isGlobal) return -1;
          if (b.isGlobal) return 1;
          return a.frameIndex - b.frameIndex;
        });
        
        return {
          fileId: index + 1,
          fileName: fileData.fileName,
          filePath: fileData.filePath,
          imageId: fileData.imageId,
          studyInstanceUID: fileData.studyInstanceUID,
          seriesInstanceUID: fileData.seriesInstanceUID,
          sopInstanceUID: fileData.sopInstanceUID,
          sopClassUID: fileData.sopClassUID,
          modality: fileData.modality,
          numberOfFrames: fileData.numberOfFrames,
          rows: fileData.rows,
          columns: fileData.columns,
          totalRedactionAreas: fileData.redactionAreas.length,
          totalFramesWithRedactions: frameRedactions.length,
          frameRedactions: frameRedactions
        };
      });
      
      // Build final JSON metadata
      const jsonMetadata = {
        exportTimestamp: new Date().toISOString(),
        isGlobalRedaction: isGlobal,
        redactionType: isGlobal ? 'global' : 'frame-specific',
        totalFiles: files.length,
        totalRedactionAreas: allAreas.length,
        files: files
      };

      return {
        success: true,
        metadata: jsonMetadata
      };
    } catch (error) {
      console.error('Error exporting redaction metadata:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export default new RedactionService();
