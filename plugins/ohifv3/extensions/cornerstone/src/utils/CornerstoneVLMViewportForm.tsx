import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { getEnabledElement, StackViewport, BaseVolumeViewport } from '@cornerstonejs/core';
import { ToolGroupManager, segmentation, Enums, utilities as cstUtils } from '@cornerstonejs/tools';
import { getEnabledElement as OHIFgetEnabledElement } from '../state';
import { useSystem } from '@ohif/core/src';
import axios from "axios";

const VLM_VIEWPORT_ID = 'cornerstone-vlm-viewport-form';

type VLMViewportFormProps = {
  hide: () => void;
  activeViewportId: string;
};

const CornerstoneVLMViewportForm = ({
  hide,
  activeViewportId: activeViewportIdProp,
}: VLMViewportFormProps) => {
  const { servicesManager } = useSystem();
  const { uiNotificationService, cornerstoneViewportService, displaySetService, viewportGridService, segmentationService } = servicesManager.services;
  
  // Get configuration from window.config
  const getConfig = () => {
    return (window as any).config || {};
  };
  const [prompt, setPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<any>(null);
  const [showExamplePrompts, setShowExamplePrompts] = useState(true);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);

  const refViewportEnabledElementOHIF = OHIFgetEnabledElement(activeViewportIdProp);
  const activeViewportElement = refViewportEnabledElementOHIF?.element;
  const { viewportId: activeViewportId, renderingEngineId } =
    getEnabledElement(activeViewportElement);

  const renderingEngine = cornerstoneViewportService.getRenderingEngine();
  const toolGroup = ToolGroupManager.getToolGroupForViewport(activeViewportId, renderingEngineId);

  const captureViewportImage = async (): Promise<string | null> => {
    if (!activeViewportElement) {
      return null;
    }

    setIsCapturing(true);
    try {
      const canvas = await html2canvas(activeViewportElement as HTMLElement, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        allowTaint: true,
      });
      
      return canvas.toDataURL('image/jpeg', .90);
    } catch (error) {
      console.error('Error capturing viewport:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const examplePrompts = {
    radiologist: [
      'Identify any abnormalities or lesions in this medical image',
      'Describe the anatomical structures visible in this scan',
      'Assess the image quality and diagnostic value',
      'Is there a non-biological foreign object present in this image? Do not identify the object, just confirm its presence',
      'Provide differential diagnosis based on the imaging findings',
      "Retrieve this patient's history and create a simplified timeline of their hospitalization"
    ],
    medicalDirector: [
      'Analyze the clinical significance of these imaging findings',
      'Assess the urgency level and recommend next steps',
      'Evaluate the technical quality and diagnostic confidence',
      'Provide guidance on patient management based on these images',
      'Review compliance with imaging protocols and standards'
    ],
    general: [
      'What do you see in this medical image?',
      'Explain the key findings in simple terms',
      'What should I look for in this type of scan?',
      'Scan this image for any visible PHI in the image or in the metadata',
      'Help me understand what this image shows'
    ]
  };

  // Auto-capture image when component mounts
  useEffect(() => {
    const autoCapture = async () => {
      const imageDataUrl = await captureViewportImage();
      if (imageDataUrl) {
        setCapturedImage(imageDataUrl);
        // Extract metadata from the viewport
        extractImageMetadata();
      }
    };
    
    autoCapture();
  }, []);

  const extractImageMetadata = () => {
    try {
      // Get the viewport state to find the display set instance UID
      const { viewports } = viewportGridService.getState();
      const viewportInfo = viewports.get(activeViewportIdProp);
      
      if (!viewportInfo) {
        console.warn('No viewport info found for:', activeViewportIdProp);
        return;
      }

      const displaySetInstanceUID = viewportInfo.displaySetInstanceUIDs?.[0];
      if (!displaySetInstanceUID) {
        console.warn('No display set instance UID found for viewport:', activeViewportIdProp);
        return;
      }

      // Get the current display sets from the display set service
      const displaySets = displaySetService.getActiveDisplaySets();
      const activeDisplaySet = displaySets.find(ds => 
        ds.displaySetInstanceUID === displaySetInstanceUID
      );
      
      if (activeDisplaySet) {
        // Get metadata from the current instance
        const metadata = activeDisplaySet.instance || activeDisplaySet;
        
        // Extract segmentation information
        const segmentationInfo = extractSegmentationInfo();
        
        const dicomMetadata = {
          imageId: metadata.imageId,
          patientName: metadata.PatientName,
          patientId: metadata.PatientID,
          studyDate: metadata.StudyDate,
          studyTime: metadata.StudyTime,
          //studyDescription: metadata.StudyDescription,
          seriesDescription: metadata.SeriesDescription,
          modality: metadata.Modality,
          instanceNumber: metadata.InstanceNumber,
          seriesNumber: metadata.SeriesNumber,
          studyInstanceUID: metadata.StudyInstanceUID,
          seriesInstanceUID: metadata.SeriesInstanceUID,
          sopInstanceUID: metadata.SOPInstanceUID,
          sopClassUID: metadata.SOPClassUID,
          segmentationInfo: segmentationInfo,
          timestamp: new Date().toISOString(),
        };
        setImageMetadata(dicomMetadata);
      }
    } catch (error) {
      console.error('Error extracting DICOM metadata:', error);
    }
  };

  const extractSegmentationInfo = () => {
    try {
      const allSegmentations = segmentationService.getSegmentations();
      if (!allSegmentations?.length) {
        return {
          hasSegmentation: false,
          segmentationCount: 0,
          segmentations: []
        };
      }

      const activeSegmentation = segmentationService.getActiveSegmentation(activeViewportIdProp);
      const activeSegment = segmentationService.getActiveSegment(activeViewportIdProp);

      // Get segmentation representations for this viewport using OHIF 3.9+ API
      let segmentationRepresentations = [];
      try {
        // Use the viewport-specific segmentation service methods
        const viewportIdsWithSegmentation = segmentationService.getViewportIdsWithSegmentation();
        const hasSegmentationInViewport = viewportIdsWithSegmentation.includes(activeViewportIdProp);
        
        if (hasSegmentationInViewport) {
          // Get all segmentations and check which ones are represented in this viewport
          segmentationRepresentations = allSegmentations.map(seg => ({
            segmentationId: seg.id,
            viewportId: activeViewportIdProp,
            hasRepresentation: true
          }));
        }
      } catch (error) {
        console.warn('Could not get segmentation representations:', error);
      }

      // Extract all segments with representation status
      const visibleSegments = [];
      
      allSegmentations.forEach(segmentation => {
        if (!segmentation) return;
        
        // Handle different segment data structures
        const segments = segmentation.segments;
        if (!segments) return;
        
        // Handle OHIF 3.9+ segment structure (object with numeric keys)
        const segmentEntries = Object.values(segments);
        
        segmentEntries.forEach(segment => {
          if (!segment) return;
          
          // Check if segmentation has representation in this viewport
          const hasRepresentation = segmentationRepresentations.some(rep => 
            rep.segmentationId === segmentation.id
          );
          
          const isActive = activeSegmentation?.id === segmentation.id && 
                          activeSegment?.segmentIndex === segment.segmentIndex;
          
          visibleSegments.push({
            segmentationId: segmentation.id,
            segmentationLabel: segmentation.label || 'Unnamed Segmentation',
            segmentIndex: segment.segmentIndex,
            segmentLabel: segment.label || `Segment ${segment.segmentIndex}`,
            color: segment.color,
            locked: segment.locked || false,
            active: segment.active || false,
            hasRepresentation,
            isActive,
            cachedStats: segment.cachedStats || {}
          });
        });
      });

      return {
        hasSegmentation: true,
        segmentationCount: allSegmentations.length,
        visibleSegmentsCount: visibleSegments.length,
        visibleSegments,
        segmentationRepresentations,
        activeSegmentation: activeSegmentation ? {
          id: activeSegmentation.id,
          label: activeSegmentation.label,
          activeSegmentIndex: activeSegment?.segmentIndex
        } : null,
        viewportId: activeViewportIdProp,
        renderingEngineId
      };
    } catch (error) {
      console.error('Error extracting segmentation info:', error);
      return {
        hasSegmentation: false,
        segmentationCount: 0,
        segmentations: [],
        error: 'Failed to extract segmentation data'
      };
    }
  };

  const handleAnalyze = async () => {
    if (!prompt.trim()) {
      uiNotificationService.show({
        title: 'VLM Analyzer',
        message: 'Please enter a prompt for analysis',
        type: 'warning',
      });
      return;
    }

    setIsAnalyzing(true);
    //setShowExamplePrompts(false);
    
    try {
      // Capture the current viewport image
      const imageDataUrl = await captureViewportImage();
      
      if (!imageDataUrl) {
        throw new Error('Failed to capture viewport image');
      }

      setCapturedImage(imageDataUrl);
      
      const base64Data = imageDataUrl.split(',')[1];
      
      const apiPayload = {
        model: 'databricks-claude-sonnet-4',
        prompt,
        image: base64Data,
        metadata: {
          ...imageMetadata,
          imageFormat: 'jpeg',
          timestamp: new Date().toISOString(),
          userType: 'medical_professional'
        },
        max_tokens: 1000,
        temperature: 0.7
      };
      
      // Build API URL from configuration
      const config = getConfig();
      const dataSource = config.dataSources?.find((ds: any) => ds.sourceName === 'databricksPixelsDicom');
      const serverHostname = dataSource?.configuration?.serverHostname || 'http://localhost:8010';
      const apiUrl = `${serverHostname.replace("/sqlwarehouse", "")}/vlm/analyze`;
        
        // Make API call to VLM service
        const response = await axios.post(apiUrl, apiPayload, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      
      if (response.status !== 200) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const result = response.data;
      console.log(result);
      setAnalysisResult(result.analysis || result || 'Analysis completed successfully.');
      
      uiNotificationService.show({
        title: 'VLM Analyzer',
        message: `Analysis completed for prompt: "${prompt}"`,
        type: 'success',
      });
    } catch (error) {
      console.error('VLM Analysis Error:', error);
      
      // Fallback to mock response for development
      const mockResult = `Based on the analysis of the medical image with the prompt "${prompt}", here are the findings:

• The image appears to show anatomical structures consistent with the requested analysis
• Key features have been identified and analyzed according to the specified criteria
• The analysis suggests normal anatomical presentation within expected parameters
• No significant abnormalities were detected in the current view

Note: This is a simulated response. API endpoint not available or configured.`;
      
      setAnalysisResult(mockResult);
      
      uiNotificationService.show({
        title: 'VLM Analyzer',
        message: 'Using simulated response (API not configured)',
        type: 'warning',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExamplePrompt = (promptText: string) => {
    setPrompt(promptText);
    //setShowExamplePrompts(false);
    setShowPromptDropdown(false);
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2 text-white">Analyze image via VLM</h3>
        <p className="text-sm text-white mb-4">
          Analyze the current viewport image using AI vision language models.
        </p>
      </div>

      {isCapturing && (
        <div className="mb-4 p-4 border border-gray-300 rounded-md bg-gray-50">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-sm text-gray-600">Capturing viewport image...</span>
          </div>
        </div>
      )}

      {capturedImage && (
        <div className="mb-4">
          <div className="flex justify-center">
            <div className="inline-block border border-gray-300 rounded-md bg-white">
              <img 
                src={capturedImage} 
                alt="Captured viewport" 
                className="max-w-full h-auto max-h-64 object-contain block bg-white"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="vlm-prompt" className="block text-sm font-medium mb-2 text-white">
          Analysis Prompt
        </label>
        
        {/* Example Prompt Dropdown */}
        {showExamplePrompts && (
          <div className="mb-3">
            <div className="relative">
              <button
                onClick={() => setShowPromptDropdown(!showPromptDropdown)}
                className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-between"
                disabled={isAnalyzing || isCapturing}
              >
                <span>📝 Quick Prompts</span>
                <span className="text-xs">{showPromptDropdown ? '▲' : '▼'}</span>
              </button>
              
              {showPromptDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
                  <div className="p-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">For Radiologists:</div>
                    {examplePrompts.radiologist.map((examplePrompt, index) => (
                      <button
                        key={`rad-${index}`}
                        onClick={() => handleExamplePrompt(examplePrompt)}
                        className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded mb-1"
                        disabled={isAnalyzing || isCapturing}
                      >
                        {examplePrompt}
                      </button>
                    ))}
                    
                    <div className="text-xs font-semibold text-gray-600 mb-2 mt-3">For Medical Directors:</div>
                    {examplePrompts.medicalDirector.map((examplePrompt, index) => (
                      <button
                        key={`md-${index}`}
                        onClick={() => handleExamplePrompt(examplePrompt)}
                        className="w-full text-left px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded mb-1"
                        disabled={isAnalyzing || isCapturing}
                      >
                        {examplePrompt}
                      </button>
                    ))}
                    
                    <div className="text-xs font-semibold text-gray-600 mb-2 mt-3">General:</div>
                    {examplePrompts.general.map((examplePrompt, index) => (
                      <button
                        key={`gen-${index}`}
                        onClick={() => handleExamplePrompt(examplePrompt)}
                        className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded mb-1"
                        disabled={isAnalyzing || isCapturing}
                      >
                        {examplePrompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <textarea
          id="vlm-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to analyze in the image..."
          className="w-full p-3 border border-gray-300 rounded-md resize-none"
          rows={4}
          disabled={isAnalyzing || isCapturing}
        />
      </div>

      {analysisResult && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-white">
              Analysis Results
            </label>
            <button
              onClick={() => setAnalysisResult(null)}
              className="text-xs text-gray-400 hover:text-gray-300 underline"
              disabled={isAnalyzing || isCapturing}
            >
              Clear Results
            </button>
          </div>
          <div className="bg-white border border-gray-300 rounded-md p-4 max-h-64 overflow-y-auto">
            <div className="text-sm text-gray-800 whitespace-pre-wrap">
              {analysisResult}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-2">
        <button
          onClick={hide}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
          disabled={isAnalyzing || isCapturing}
        >
          Cancel
        </button>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isCapturing || !prompt.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Image'}
        </button>
      </div>
    </div>
  );
};

export default CornerstoneVLMViewportForm;
