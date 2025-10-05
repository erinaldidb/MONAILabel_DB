/*
OHIF Image Redactor Extension Copyright (2025) Databricks, Inc.
Author: Emanuele Rinaldi <emanuele.rinaldi@databricks.com>

This library (the "Software") may not be used except in connection with the Licensee's use of the Databricks Platform Services pursuant to an Agreement (defined below) between Licensee (defined below) and Databricks, Inc. ("Databricks"). The Object Code version of the Software shall be deemed part of the Downloadable Services under the Agreement, or if the Agreement does not define Downloadable Services, Subscription Services, or if neither are defined then the term in such Agreement that refers to the applicable Databricks Platform Services (as defined below) shall be substituted herein for "Downloadable Services." Licensee's use of the Software must comply at all times with any restrictions applicable to the Downlodable Services and Subscription Services, generally, and must be used in accordance with any applicable documentation. For the avoidance of doubt, the Software constitutes Databricks Confidential Information under the Agreement. Additionally, and notwithstanding anything in the Agreement to the contrary:
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
* you may view, make limited copies of, and may compile the Source Code version of the Software into an Object Code version of the Software. For the avoidance of doubt, you may not make derivative works of Software (or make any any changes to the Source Code version of the unless you have agreed to separate terms with Databricks permitting such modifications (e.g., a contribution license agreement)).
If you have not agreed to an Agreement or otherwise do not agree to these terms, you may not use the Software or view, copy or compile the Source Code of the Software. This license terminates automatically upon the termination of the Agreement or Licensee's breach of these terms. Additionally, Databricks may terminate this license at any time on notice. Upon termination, you must permanently delete the Software and all copies thereof (including the Source Code).
*/

import React, { useState, useEffect } from 'react';
import RedactionService from '../services/RedactionService';
import RedactionRectangleTool from '../tools/RedactionRectangleTool';

interface RedactionPanelProps {
  servicesManager: any;
  commandsManager: any;
  extensionManager?: any;
}

const RedactionPanel: React.FC<RedactionPanelProps> = ({
  servicesManager,
  commandsManager,
  extensionManager,
}) => {
  const [redactionAreas, setRedactionAreas] = useState<any[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [previewFrames, setPreviewFrames] = useState<Array<{frameIndex: number, areaCount: number}>>([]);
  const [previewPopupOpen, setPreviewPopupOpen] = useState(false);
  const [previewPopupImage, setPreviewPopupImage] = useState<string | null>(null);
  const [previewPopupFrameIndex, setPreviewPopupFrameIndex] = useState<number>(0);
  const [stats, setStats] = useState<{ totalAreas: number; canUndo: boolean; areas: any[] }>({ totalAreas: 0, canUndo: false, areas: [] });
  const [applyToAllFrames, setApplyToAllFrames] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  // Track the number of annotations and frame index to detect changes
  const [previousAnnotationCount, setPreviousAnnotationCount] = useState(0);
  const [previousFrameIndex, setPreviousFrameIndex] = useState(0);

  const { viewportGridService, toolGroupService, cornerstoneViewportService } = servicesManager.services;

  // Get current viewport info
  const getCurrentViewport = () => {
    const { viewports, activeViewportId } = viewportGridService.getState();
    const viewport = viewports.get(activeViewportId);
    const cornerstoneViewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
    
    // Extract frame index from imageId or viewport
    let frameIndex = 0;
    if (cornerstoneViewport) {
      // Method 1: For stack viewports, use getCurrentImageIdIndex
      if (typeof cornerstoneViewport.getCurrentImageIdIndex === 'function') {
        frameIndex = cornerstoneViewport.getCurrentImageIdIndex();
      }
      // Method 2: For multiframe images, parse from imageId
      else {
        const imageId = cornerstoneViewport.getCurrentImageId();
        if (imageId && imageId.startsWith('multiframe:')) {
          const parts = imageId.substring('multiframe:'.length).split('&frame=');
          frameIndex = parseInt(parts[1]) || 0;
        }
      }
    }
    
    return {
      viewportId: activeViewportId,
      viewport: cornerstoneViewport,
      element: cornerstoneViewport?.element,
      frameIndex: frameIndex,
    };
  };

  // Update stats from stored areas
  const updateStats = () => {
    const { viewportId } = getCurrentViewport();
    const currentStats = RedactionService.getRedactionStats(viewportId, applyToAllFrames);
    setStats(currentStats);
  };

  // Clear all redaction areas
  const clearAllAreas = () => {
    const { viewportId, element, viewport } = getCurrentViewport();
    if (element && viewport) {
      RedactionService.clearRedactionAreas(viewportId, element, applyToAllFrames);
      
      // Get rendering engine and force full re-render
      const renderingEngine = viewport.getRenderingEngine();
      if (renderingEngine) {
        renderingEngine.render();
      } else {
        viewport.render();
      }
      
      // Update stats
      updateStats();
    }
  };

  // Delete individual redaction area
  const deleteRedactionArea = (annotationUID) => {
    const { viewportId, element, viewport } = getCurrentViewport();
    if (element && viewport) {
      RedactionService.deleteRedactionArea(viewportId, annotationUID, element);
      viewport.render();
      updateStats();
    }
  };

  // Handle mouse enter on area item - highlight the annotation
  const handleAreaHover = (annotationUID, isHovering) => {
    const { element, viewport } = getCurrentViewport();
    if (element && viewport) {
      RedactionService.highlightRedactionArea(annotationUID, element, isHovering);
      viewport.render();
    }
  };

  // Navigate to a specific frame
  const navigateToFrame = (targetFrameIndex: number) => {
    const { viewport } = getCurrentViewport();
    if (!viewport || typeof viewport.setImageIdIndex !== 'function') return;
    
    viewport.setImageIdIndex(targetFrameIndex);
    viewport.render();
    
    setTimeout(() => {
      setCurrentFrameIndex(targetFrameIndex);
    }, 200);
  };

  // Handle clicking on a redaction area to navigate to its frame
  const handleAreaClick = (area: any) => {
    if (!applyToAllFrames && area.frameIndex !== undefined && area.frameIndex !== currentFrameIndex) {
      navigateToFrame(area.frameIndex);
    }
  };

  // Apply redaction with confirmation - generate preview for current frame only
  const handleApplyRedaction = async () => {
    if (stats.totalAreas === 0) {
      alert('No redaction areas defined. Please draw redaction rectangles first.');
      return;
    }
    
    const { viewportId, viewport } = getCurrentViewport();
    if (!viewport) return;
    
    try {
      // Get all frames that have redaction areas
      const framesWithAreas = new Map<number, number>(); // frameIndex -> count
      stats.areas.forEach(area => {
        const frameIdx = area.frameIndex !== undefined ? area.frameIndex : 0;
        framesWithAreas.set(frameIdx, (framesWithAreas.get(frameIdx) || 0) + 1);
      });
      
      if (framesWithAreas.size === 0) {
        alert('No redaction areas found.');
        return;
      }
      
      // Create preview data for all frames (without generating images)
      const previews: Array<{frameIndex: number, areaCount: number}> = [];
      
      for (const [frameIdx, count] of Array.from(framesWithAreas.entries()).sort((a, b) => a[0] - b[0])) {
        previews.push({
          frameIndex: frameIdx,
          areaCount: count
        });
      }
      
      if (previews.length > 0) {
        setPreviewFrames(previews);
        setConfirmDialogOpen(true);
      } else {
        alert('No frames with redaction areas found');
      }
    } catch (error: any) {
      alert('Error preparing preview: ' + error.message);
    }
  };

  // Confirm and apply redaction - download metadata JSON only
  const confirmApplyRedaction = async () => {
    const { viewportId, viewport, element } = getCurrentViewport();
    if (!viewport || !element) return;

    setConfirmDialogOpen(false);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Export redaction metadata
      const result = await RedactionService.exportRedactedDICOM(viewportId, viewport, element, redactionAreas, applyToAllFrames);
      
      if (!result.success) {
        alert(`Error: ${result.error}`);
        return;
      }
      
      const { metadata } = result;
      
      if (!metadata) {
        alert('Failed to generate redaction metadata');
        return;
      }
      
      // Download metadata JSON
      const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const jsonLink = document.createElement('a');
      
      // Generate filename based on number of files
      let downloadFileName;
      if (metadata.files && metadata.files.length > 0) {
        if (metadata.files.length === 1) {
          // Single file: use its name
          const baseFileName = metadata.files[0].fileName.replace('.dcm', '');
          downloadFileName = `redacted_metadata_${baseFileName}_${timestamp}.json`;
        } else {
          // Multiple files: use count
          downloadFileName = `redacted_metadata_${metadata.files.length}_files_${timestamp}.json`;
        }
      } else {
        downloadFileName = `redacted_metadata_${timestamp}.json`;
      }
      
      jsonLink.download = downloadFileName;
      jsonLink.href = jsonUrl;
      jsonLink.click();
      URL.revokeObjectURL(jsonUrl);
      
      // Mark as applied in service
      const applyResult = await RedactionService.applyRedaction(viewportId, viewport, redactionAreas);
      
      if (applyResult.success) {
        alert(`Redaction metadata saved successfully!\n\nDownloaded:\n- Metadata JSON with redaction coordinates\n\nTotal redacted areas: ${stats.totalAreas}`);
        updateStats();
      }
      
      // Clear preview
      setPreviewFrames([]);
    } catch (error: any) {
      console.error('Error applying redaction:', error);
      alert(`Error applying redaction: ${error.message}`);
      setPreviewFrames([]);
    }
  };
  
  // Cancel dialog and clear preview
  const cancelApplyRedaction = () => {
    setConfirmDialogOpen(false);
    setPreviewFrames([]);
  };

  // Show preview for a specific frame
  const showFramePreview = async (frameIdx: number) => {
    const { viewportId, viewport, element } = getCurrentViewport();
    if (!viewport || !element) return;
    
    try {
      const originalFrameIndex = currentFrameIndex;
      
      // Navigate to the target frame
      if (typeof viewport.setImageIdIndex === 'function') {
        viewport.setImageIdIndex(frameIdx);
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for frame to load
      }
      
      // Get only the annotations for this specific frame from storage
      const frameAnnotations = RedactionService.getStoredFrameAreas(viewportId, frameIdx);
      
      // Generate preview for this frame with only its annotations
      // The exportRedactedImageWithAreas will use only the provided areas, ignoring viewport annotations
      const result = await RedactionService.exportRedactedImageWithAreas(viewportId, viewport, frameAnnotations);
      
      // Navigate back to original frame
      if (typeof viewport.setImageIdIndex === 'function') {
        viewport.setImageIdIndex(originalFrameIndex);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Force viewport render
      viewport.render();
      
      if (result.success && result.dataUrl) {
        setPreviewPopupImage(result.dataUrl);
        setPreviewPopupFrameIndex(frameIdx);
        setPreviewPopupOpen(true);
      } else {
        alert('Failed to generate preview: ' + (result.error || result.message));
      }
    } catch (error: any) {
      alert('Error generating preview: ' + error.message);
    }
  };

  // Close preview popup
  const closePreviewPopup = () => {
    setPreviewPopupOpen(false);
    setPreviewPopupImage(null);
  };

  // Undo redaction
  const handleUndoRedaction = async () => {
    const { viewportId, viewport } = getCurrentViewport();
    if (!viewport) return;

    try {
      const result = await RedactionService.undoRedaction(viewportId, viewport);
      
      if (result.success) {
        alert(result.message);
        updateStats();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Error undoing redaction: ${error.message}`);
    }
  };

  // Watch for annotation and frame changes
  useEffect(() => {
    updateStats(); // Initial load
    
    const intervalId = setInterval(() => {
      const { element, frameIndex, viewportId, viewport } = getCurrentViewport();
      if (!element || !viewport) return;
      
      // Detect frame change
      if (frameIndex !== previousFrameIndex) {
        console.log(`Frame changed: ${previousFrameIndex} → ${frameIndex}`);
        setPreviousFrameIndex(frameIndex);
        setCurrentFrameIndex(frameIndex);
        
        const areas = RedactionRectangleTool.getRedactionAreas(element);
        setPreviousAnnotationCount(areas.length);
        updateStats();
        return;
      }
      
      // Detect annotation changes
      const areas = RedactionRectangleTool.getRedactionAreas(element);
      const currentCount = areas.length;
      
      if (currentCount > previousAnnotationCount) {
        // New annotations added
        const newAnnotations = areas.slice(-(currentCount - previousAnnotationCount));
        console.log(`Storing ${newAnnotations.length} new annotation(s) for frame ${frameIndex}`);
        RedactionService.storeSpecificAreas(viewportId, viewport, newAnnotations, frameIndex, applyToAllFrames);
        setPreviousAnnotationCount(currentCount);
        updateStats();
      } else if (currentCount < previousAnnotationCount) {
        // Annotation deleted
        console.log(`Annotation deleted on frame ${frameIndex}`);
        setPreviousAnnotationCount(currentCount);
        updateStats();
      } else if (currentCount > 0) {
        // Check for modifications on current frame's annotations only
        const storedAreas = RedactionService.getStoredFrameAreas(viewportId, frameIndex);
        if (storedAreas.length > 0) {
          const storedUIDs = new Set(storedAreas.map(a => a.annotationUID));
          const currentFrameAreas = areas.filter(a => storedUIDs.has(a.annotationUID));
          
          // Check if any coordinates changed
          const hasChanges = currentFrameAreas.some(area => {
            const stored = storedAreas.find(s => s.annotationUID === area.annotationUID);
            return stored && (
              area.topLeft[0] !== stored.topLeft[0] ||
              area.topLeft[1] !== stored.topLeft[1] ||
              area.bottomRight[0] !== stored.bottomRight[0] ||
              area.bottomRight[1] !== stored.bottomRight[1]
            );
          });
          
          if (hasChanges) {
            console.log(`Annotation(s) modified on frame ${frameIndex}`);
            RedactionService.updateFrameAreas(viewportId, viewport, currentFrameAreas, frameIndex, applyToAllFrames);
            updateStats();
          }
        }
      }
    }, 300);
    
    return () => clearInterval(intervalId);
  }, [previousAnnotationCount, previousFrameIndex, applyToAllFrames]);

  return (
    <div className="redaction-panel" style={{ padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <h3 style={{ marginBottom: '16px', color: '#333' }}>
        Image Redactor
      </h3>

      {/* Global Redaction Checkbox */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={applyToAllFrames}
            onChange={(e) => {
              setApplyToAllFrames(e.target.checked);
              setTimeout(() => updateStats(), 100);
            }}
            style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 'bold', color: '#495057' }}>
            Apply to All Frames (Global Redaction)
          </span>
        </label>
        <p style={{ margin: '8px 0 0 24px', fontSize: '12px', color: '#6c757d', fontStyle: 'italic' }}>
          {applyToAllFrames 
            ? 'Redaction areas will apply to all frames in the series' 
            : `Redaction areas apply only to current frame (Frame ${currentFrameIndex + 1})`}
        </p>
      </div>

      {/* Tool Controls */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={clearAllAreas}
          disabled={stats.totalAreas === 0}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: stats.totalAreas === 0 ? '#e9ecef' : '#dc3545',
            color: stats.totalAreas === 0 ? '#6c757d' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: stats.totalAreas === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          Clear All Areas ({stats.totalAreas})
        </button>
      </div>

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #dee2e6' }} />

      {/* Redaction Areas List */}
      <div style={{ margin: '16px 0' }}>
        <h4 style={{ marginBottom: '8px', fontSize: '14px', color: '#495057' }}>
          Redaction Areas ({stats.totalAreas})
        </h4>
        
        {stats.areas.length > 0 ? (
          <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #dee2e6', borderRadius: '4px' }}>
            {stats.areas
              .sort((a, b) => {
                // Sort by frame index first, then by id
                if (!applyToAllFrames) {
                  if (a.frameIndex !== b.frameIndex) {
                    return (a.frameIndex || 0) - (b.frameIndex || 0);
                  }
                }
                return a.id - b.id;
              })
              .map((area) => (
              <div 
                key={area.id} 
                style={{ 
                  padding: '8px', 
                  borderBottom: '1px solid #f8f9fa',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: !applyToAllFrames && area.frameIndex !== currentFrameIndex ? 'pointer' : 'default',
                  transition: 'background-color 0.2s',
                  backgroundColor: !applyToAllFrames && area.frameIndex === currentFrameIndex ? '#e7f3ff' : 'transparent',
                }}
                onClick={() => handleAreaClick(area)}
                onMouseEnter={() => handleAreaHover(area.annotationUID, true)}
                onMouseLeave={() => handleAreaHover(area.annotationUID, false)}
                onMouseOver={(e) => {
                  if (!applyToAllFrames && area.frameIndex !== currentFrameIndex) {
                    e.currentTarget.style.backgroundColor = '#fff3cd';
                  } else {
                    e.currentTarget.style.backgroundColor = e.currentTarget.style.backgroundColor || '#f8f9fa';
                  }
                }}
                onMouseOut={(e) => {
                  if (!applyToAllFrames && area.frameIndex === currentFrameIndex) {
                    e.currentTarget.style.backgroundColor = '#e7f3ff';
                  } else {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#495057', fontWeight: 'bold' }}>
                    {applyToAllFrames ? (
                      <span>🌐 Area {area.id} (Global)</span>
                    ) : (
                      <span>
                        📍 Frame {area.frameIndex !== undefined ? area.frameIndex + 1: '?'} - Area {area.id}
                        {area.frameIndex === currentFrameIndex && ' ⭐'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '2px' }}>
                    {applyToAllFrames ? (
                      <span>Applies to all frames</span>
                    ) : (
                      <span>
                        {area.frameIndex === currentFrameIndex 
                          ? 'Current frame' 
                          : 'Click to navigate'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRedactionArea(area.annotationUID);
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Delete this redaction area"
                >
                  X
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: '#6c757d', fontStyle: 'italic' }}>
            No redaction areas defined. Use the redaction tool to draw rectangles.
          </p>
        )}
      </div>

      <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #dee2e6' }} />

      {/* Action Buttons */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={handleApplyRedaction}
          disabled={stats.totalAreas === 0}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '8px',
            backgroundColor: stats.totalAreas === 0 ? '#e9ecef' : '#28a745',
            color: stats.totalAreas === 0 ? '#6c757d' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: stats.totalAreas === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          Apply Redaction ({stats.totalAreas} areas)
        </button>
        
        <button
          onClick={handleUndoRedaction}
          disabled={!stats.canUndo}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: !stats.canUndo ? '#e9ecef' : '#ffc107',
            color: !stats.canUndo ? '#6c757d' : '#212529',
            border: 'none',
            borderRadius: '4px',
            cursor: !stats.canUndo ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          Undo Redaction
        </button>
      </div>

      {/* Confirmation Dialog with Preview */}
      {confirmDialogOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          overflow: 'auto',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h4 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
              Confirm Redaction
            </h4>
            
            {/* Redaction Summary */}
            {previewFrames.length > 0 && (
              <div style={{ 
                marginBottom: '16px',
                border: '2px solid #dee2e6',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: '#f8f9fa'
              }}>
                <div style={{
                  padding: '12px',
                  backgroundColor: '#e9ecef',
                  borderBottom: '1px solid #dee2e6',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: '#495057'
                }}>
                  Redaction Summary
                </div>
                
                <div style={{ 
                  maxHeight: '300px', 
                  overflow: 'auto',
                  padding: '12px'
                }}>
                  {previewFrames.map((frame, index) => (
                    <div 
                      key={frame.frameIndex}
                      style={{
                        padding: '12px',
                        marginBottom: '8px',
                        backgroundColor: 'white',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>
                          📍 Frame {frame.frameIndex + 1}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                          {frame.areaCount} redaction area{frame.areaCount > 1 ? 's' : ''} marked
                        </div>
                      </div>
                      <button
                        onClick={() => showFramePreview(frame.frameIndex)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        Preview
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <p style={{ marginBottom: '8px', fontSize: '14px' }}>
              Are you sure you want to apply redaction to <strong>{stats.totalAreas} area(s)</strong> across <strong>{previewFrames.length} frame(s)</strong>? 
            </p>
            <p style={{ fontSize: '12px', color: '#6c757d', marginBottom: '20px' }}>
              Review the redacted frames above. Metadata JSON will be downloaded.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={cancelApplyRedaction}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmApplyRedaction}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Confirm & Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Popup for Individual Frame */}
      {previewPopupOpen && previewPopupImage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}
        onClick={closePreviewPopup}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px',
              backgroundColor: '#e9ecef',
              borderBottom: '2px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#495057' }}>
                Preview: Frame {previewPopupFrameIndex + 1}
              </div>
              <button
                onClick={closePreviewPopup}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ✕ Close
              </button>
            </div>
            
            {/* Image */}
            <div style={{ 
              padding: '20px',
              backgroundColor: '#000',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <img 
                src={previewPopupImage} 
                alt={`Frame ${previewPopupFrameIndex + 1} Preview`}
                style={{ 
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  display: 'block'
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RedactionPanel;
