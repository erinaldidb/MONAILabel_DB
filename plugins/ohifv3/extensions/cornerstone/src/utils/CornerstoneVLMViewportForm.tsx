import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { getEnabledElement, StackViewport, BaseVolumeViewport } from '@cornerstonejs/core';
import { ToolGroupManager, segmentation, Enums } from '@cornerstonejs/tools';
import { getEnabledElement as OHIFgetEnabledElement } from '../state';
import { useSystem } from '@ohif/core/src';

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
  const { uiNotificationService, cornerstoneViewportService } = servicesManager.services;
  const [prompt, setPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

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
      
      return canvas.toDataURL('image/png', 1.0);
    } catch (error) {
      console.error('Error capturing viewport:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  // Auto-capture image when component mounts
  useEffect(() => {
    const autoCapture = async () => {
      const imageDataUrl = await captureViewportImage();
      if (imageDataUrl) {
        setCapturedImage(imageDataUrl);
      }
    };
    
    autoCapture();
  }, []);

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
    
    try {
      // Capture the current viewport image
      const imageDataUrl = await captureViewportImage();
      
      if (!imageDataUrl) {
        throw new Error('Failed to capture viewport image');
      }

      setCapturedImage(imageDataUrl);
      
      // TODO: Implement VLM analysis logic here
      // This would typically involve:
      // 1. Sending image + prompt to VLM service
      // 2. Processing and displaying results
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      // Simulate VLM response
      const mockResult = `Based on the analysis of the medical image with the prompt "${prompt}", here are the findings:

• The image appears to show anatomical structures consistent with the requested analysis
• Key features have been identified and analyzed according to the specified criteria
• The analysis suggests normal anatomical presentation within expected parameters
• No significant abnormalities were detected in the current view

This is a simulated response. In a real implementation, this would contain the actual VLM analysis results.`;
      
      setAnalysisResult(mockResult);
      
      uiNotificationService.show({
        title: 'VLM Analyzer',
        message: `Analysis completed for prompt: "${prompt}"`,
        type: 'success',
      });
    } catch (error) {
      uiNotificationService.show({
        title: 'VLM Analyzer',
        message: 'Analysis failed. Please try again.',
        type: 'error',
      });
    } finally {
      setIsAnalyzing(false);
    }
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
