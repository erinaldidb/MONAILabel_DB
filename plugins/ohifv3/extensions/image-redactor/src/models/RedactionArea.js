/*
OHIF Image Redactor Extension Copyright (2025) Databricks, Inc.
Author: Emanuele Rinaldi <emanuele.rinaldi@databricks.com>

This library (the "Software") may not be used except in connection with the Licensee's use of the Databricks Platform Services pursuant to an Agreement (defined below) between Licensee (defined below) and Databricks, Inc. ("Databricks"). The Object Code version of the Software shall be deemed part of the Downloadable Services under the Agreement, or if the Agreement does not define Downloadable Services, Subscription Services, or if neither are defined then the term in such Agreement that refers to the applicable Databricks Platform Services (as defined below) shall be substituted herein for "Downloadable Services." Licensee's use of the Software must comply at all times with any restrictions applicable to the Downlodable Services and Subscription Services, generally, and must be used in accordance with any applicable documentation. For the avoidance of doubt, the Software constitutes Databricks Confidential Information under the Agreement. Additionally, and notwithstanding anything in the Agreement to the contrary:
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* you may view, make limited copies of, and may compile the Source Code version of the Software into an Object Code version of the Software. For the avoidance of doubt, you may not make derivative works of Software (or make any any changes to the Source Code version of the unless you have agreed to separate terms with Databricks permitting such modifications (e.g., a contribution license agreement)).
If you have not agreed to an Agreement or otherwise do not agree to these terms, you may not use the Software or view, copy or compile the Source Code of the Software. This license terminates automatically upon the termination of the Agreement or Licensee's breach of these terms. Additionally, Databricks may terminate this license at any time on notice. Upon termination, you must permanently delete the Software and all copies thereof (including the Source Code).
*/

import { cache, metaData } from '@cornerstonejs/core';

/**
 * RedactionArea - Represents a single redaction area with all its metadata
 * Fully self-contained with DICOM metadata and coordinate information
 */
export class RedactionArea {
  constructor(annotationData, viewport, frameIndex = 0, isGlobal = false) {
    // Annotation data
    this.annotationUID = annotationData.annotationUID;
    this.topLeft = annotationData.topLeft;
    this.bottomRight = annotationData.bottomRight;
    this.worldCoordinates = annotationData.worldCoordinates;
    this.cornerstoneAnnotation = annotationData;
    
    // Frame information
    this.frameIndex = isGlobal ? null : frameIndex;
    this.isGlobal = isGlobal;
    
    // Extract DICOM metadata
    this.extractDICOMMetadata(viewport);
    
    // Timestamp
    this.timestamp = new Date().toISOString();
  }

  /**
   * Extract Databricks Volume path from imageId
   * Format: .../Volumes/{catalog}/{schema}/{volume}/{file_path}
   * Returns: /Volumes/{catalog}/{schema}/{volume}/{file_path}
   */
  extractVolumePath(imageId) {
    if (!imageId) return null;
    
    try {
      // Remove protocol prefix (dicomweb:, wadouri:, multiframe:, etc.)
      let cleanUrl = imageId;
      if (imageId.includes(':')) {
        cleanUrl = imageId.split(':').slice(1).join(':');
      }
      
      // For multiframe, remove frame parameter
      if (cleanUrl.includes('&frame=')) {
        cleanUrl = cleanUrl.split('&frame=')[0];
      }
      
      // Decode URL encoding
      cleanUrl = decodeURIComponent(cleanUrl);
      
      // Extract everything from /Volumes/ onwards
      const volumesIndex = cleanUrl.indexOf('/Volumes/');
      if (volumesIndex !== -1) {
        return cleanUrl.substring(volumesIndex);
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting volume path:', error);
      return null;
    }
  }

  /**
   * Extract DICOM metadata from viewport
   */
  extractDICOMMetadata(viewport) {
    const imageId = viewport.getCurrentImageId();
    const image = cache.getImage(imageId);
    
    // Extract imageId components
    this.imageId = imageId;
    this.fileName = 'unknown.dcm';
    this.filePath = null;
    
    if (imageId.startsWith('multiframe:')) {
      const parts = imageId.substring('multiframe:'.length).split('&frame=');
      const dicomUrl = parts[0];
      this.fileName = dicomUrl.split('/').pop().split('?')[0];
    } else if (imageId.startsWith('dicomweb:')) {
      const dicomUrl = imageId.substring('dicomweb:'.length);
      this.fileName = dicomUrl.split('/').pop().split('?')[0];
    } else if (imageId.startsWith('wadouri:')) {
      const dicomUrl = imageId.substring('wadouri:'.length);
      this.fileName = dicomUrl.split('/').pop().split('?')[0];
    }
    
    // Extract Databricks Volume path
    this.filePath = this.extractVolumePath(imageId);
    
    // Get DICOM metadata from cache
    const generalSeriesModule = metaData.get('generalSeriesModule', imageId) || {};
    const sopCommonModule = metaData.get('sopCommonModule', imageId) || {};
    const imagePixelModule = metaData.get('imagePixelModule', imageId) || {};
    
    // Store DICOM identifiers
    this.studyInstanceUID = generalSeriesModule.studyInstanceUID || 'unknown';
    this.seriesInstanceUID = generalSeriesModule.seriesInstanceUID || 'unknown';
    this.sopInstanceUID = sopCommonModule.sopInstanceUID || 'unknown';
    this.sopClassUID = sopCommonModule.sopClassUID || 'unknown';
    this.modality = generalSeriesModule.modality || 'unknown';
    
    // Image dimensions
    this.rows = image?.height || image?.rows || imagePixelModule.rows || 0;
    this.columns = image?.width || image?.columns || imagePixelModule.columns || 0;
    this.numberOfFrames = metaData.get('NumberOfFrames', imageId) || 1;
  }

  /**
   * Update coordinates from a new annotation (when user resizes/moves)
   */
  updateCoordinates(annotationData) {
    this.topLeft = annotationData.topLeft;
    this.bottomRight = annotationData.bottomRight;
    this.worldCoordinates = annotationData.worldCoordinates;
    this.cornerstoneAnnotation = annotationData;
    this.timestamp = new Date().toISOString(); // Update timestamp
  }

  /**
   * Check if coordinates have changed compared to another annotation
   */
  hasCoordinatesChanged(annotationData) {
    return (
      this.topLeft[0] !== annotationData.topLeft[0] ||
      this.topLeft[1] !== annotationData.topLeft[1] ||
      this.topLeft[2] !== annotationData.topLeft[2] ||
      this.bottomRight[0] !== annotationData.bottomRight[0] ||
      this.bottomRight[1] !== annotationData.bottomRight[1] ||
      this.bottomRight[2] !== annotationData.bottomRight[2]
    );
  }

  /**
   * Get the Cornerstone annotation object for rendering
   */
  getCornerstoneAnnotation() {
    return this.cornerstoneAnnotation;
  }

  /**
   * Check if this area belongs to a specific frame
   */
  belongsToFrame(frameIndex) {
    if (this.isGlobal) return true;
    return this.frameIndex === frameIndex;
  }

  /**
   * Get a display label for this area
   */
  getDisplayLabel() {
    if (this.isGlobal) {
      return `Global - ${this.fileName}`;
    }
    return `Frame ${this.frameIndex + 1} - ${this.fileName}`;
  }

  /**
   * Get a short identifier for display
   */
  getShortUID() {
    return this.annotationUID.substring(0, 8);
  }

  /**
   * Export to JSON format with full metadata
   */
  toJSON() {
    return {
      annotationUID: this.annotationUID,
      imageId: this.imageId,
      fileName: this.fileName,
      filePath: this.filePath,
      studyInstanceUID: this.studyInstanceUID,
      seriesInstanceUID: this.seriesInstanceUID,
      sopInstanceUID: this.sopInstanceUID,
      sopClassUID: this.sopClassUID,
      modality: this.modality,
      frameIndex: this.frameIndex,
      numberOfFrames: this.numberOfFrames,
      rows: this.rows,
      columns: this.columns,
      isGlobal: this.isGlobal,
      topLeft: this.topLeft,
      bottomRight: this.bottomRight,
      worldCoordinates: this.worldCoordinates,
      timestamp: this.timestamp
    };
  }
}

/**
 * RedactionAreaManager - Manages all redaction areas across frames
 */
export class RedactionAreaManager {
  constructor() {
    this.areas = new Map(); // Map<annotationUID, RedactionArea>
    this.frameIndex = new Map(); // Map<frameIndex, Set<annotationUID>>
    this.globalAreas = new Set(); // Set<annotationUID> for global areas
  }

  /**
   * Add a new redaction area
   */
  addArea(annotationData, viewport, frameIndex, isGlobal = false) {
    const area = new RedactionArea(annotationData, viewport, frameIndex, isGlobal);
    this.areas.set(area.annotationUID, area);

    if (isGlobal) {
      this.globalAreas.add(area.annotationUID);
    } else {
      if (!this.frameIndex.has(frameIndex)) {
        this.frameIndex.set(frameIndex, new Set());
      }
      this.frameIndex.get(frameIndex).add(area.annotationUID);
    }

    return area;
  }

  /**
   * Update an existing redaction area's coordinates
   */
  updateArea(annotationUID, annotationData) {
    const area = this.areas.get(annotationUID);
    if (area) {
      area.updateCoordinates(annotationData);
      return true;
    }
    return false;
  }

  /**
   * Check if an area exists and if its coordinates have changed
   */
  hasAreaChanged(annotationUID, annotationData) {
    const area = this.areas.get(annotationUID);
    if (!area) return false;
    return area.hasCoordinatesChanged(annotationData);
  }

  /**
   * Remove a redaction area
   */
  removeArea(annotationUID) {
    const area = this.areas.get(annotationUID);
    if (!area) return false;

    this.areas.delete(annotationUID);

    if (area.isGlobal) {
      this.globalAreas.delete(annotationUID);
    } else if (area.frameIndex !== null) {
      const frameSet = this.frameIndex.get(area.frameIndex);
      if (frameSet) {
        frameSet.delete(annotationUID);
        if (frameSet.size === 0) {
          this.frameIndex.delete(area.frameIndex);
        }
      }
    }

    return true;
  }

  /**
   * Get all areas for a specific frame
   */
  getAreasForFrame(frameIndex) {
    const areas = [];
    
    // Add global areas
    for (const uid of this.globalAreas) {
      const area = this.areas.get(uid);
      if (area) areas.push(area);
    }

    // Add frame-specific areas
    const frameSet = this.frameIndex.get(frameIndex);
    if (frameSet) {
      for (const uid of frameSet) {
        const area = this.areas.get(uid);
        if (area) areas.push(area);
      }
    }

    return areas;
  }

  /**
   * Get all areas across all frames
   */
  getAllAreas() {
    return Array.from(this.areas.values());
  }

  /**
   * Get all frames that have redaction areas
   */
  getFramesWithAreas() {
    return Array.from(this.frameIndex.keys()).sort((a, b) => a - b);
  }

  /**
   * Clear all areas
   */
  clearAll() {
    this.areas.clear();
    this.frameIndex.clear();
    this.globalAreas.clear();
  }

  /**
   * Clear areas for a specific frame
   */
  clearFrame(frameIndex) {
    const frameSet = this.frameIndex.get(frameIndex);
    if (frameSet) {
      for (const uid of frameSet) {
        this.areas.delete(uid);
      }
      this.frameIndex.delete(frameIndex);
    }
  }

  /**
   * Clear global areas
   */
  clearGlobal() {
    for (const uid of this.globalAreas) {
      this.areas.delete(uid);
    }
    this.globalAreas.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalAreas: this.areas.size,
      globalAreas: this.globalAreas.size,
      framesWithAreas: this.frameIndex.size,
      framesList: this.getFramesWithAreas()
    };
  }

  /**
   * Export all areas to JSON
   */
  exportToJSON() {
    return {
      globalAreas: Array.from(this.globalAreas).map(uid => {
        const area = this.areas.get(uid);
        return area ? area.toJSON() : null;
      }).filter(a => a !== null),
      frameSpecificAreas: Array.from(this.frameIndex.entries()).map(([frameIdx, uids]) => ({
        frameIndex: frameIdx,
        areas: Array.from(uids).map(uid => {
          const area = this.areas.get(uid);
          return area ? area.toJSON() : null;
        }).filter(a => a !== null)
      }))
    };
  }
}
