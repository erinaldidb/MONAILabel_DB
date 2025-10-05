const colours = {
  'viewport-0': 'rgb(200, 0, 0)',
  'viewport-1': 'rgb(200, 200, 0)',
  'viewport-2': 'rgb(0, 200, 0)',
};

const colorsByOrientation = {
  axial: 'rgb(200, 0, 0)',
  sagittal: 'rgb(200, 200, 0)',
  coronal: 'rgb(0, 200, 0)',
};

function createTools(utilityModule) {
  const { toolNames, Enums } = utilityModule.exports;
  return {
    active: [
      { toolName: toolNames.WindowLevel, bindings: [{ mouseButton: Enums.MouseBindings.Primary }] },
      { toolName: toolNames.Pan, bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }] },
      { toolName: toolNames.Zoom, bindings: [{ mouseButton: Enums.MouseBindings.Secondary }] },
      { toolName: toolNames.StackScroll, bindings: [{ mouseButton: Enums.MouseBindings.Wheel }] },
    ],
    passive: [
      // Measurement Tools
      { toolName: toolNames.Length },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.ArrowAnnotate },
      { toolName: toolNames.EllipticalROI },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.CircleROI },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      
      // Redaction Tool - NEW
      { toolName: 'RedactionRectangle' },
      
      // Navigation Tools
      { toolName: toolNames.Magnify },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.CalibrationLine },
      { toolName: toolNames.AdvancedMagnify },
      { toolName: toolNames.UltrasoundDirectional },
      { toolName: toolNames.WindowLevelRegion },
      
      // 3D Tools
      { toolName: toolNames.TrackballRotate },
    ],
    disabled: [
      { toolName: toolNames.ReferenceLines },
      {
        toolName: toolNames.Crosshairs,
        configuration: {
          viewportIndicators: true,
          viewportIndicatorsConfig: {
            circleRadius: 5,
            xOffset: 0.95,
            yOffset: 0.05,
          },
          disableOnPassive: true,
          autoPan: {
            enabled: false,
            panSize: 10,
          },
        },
      },
    ],
  };
}

function initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, toolGroupId) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const tools = createTools(utilityModule);
  toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
}

function initMPRToolGroup(extensionManager, toolGroupService, commandsManager) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );
  const servicesManager = extensionManager._servicesManager;
  const { cornerstoneViewportService } = servicesManager.services;
  const tools = createTools(utilityModule);
  
  tools.disabled.push(
    {
      toolName: utilityModule.exports.toolNames.Crosshairs,
      configuration: {
        viewportIndicators: true,
        viewportIndicatorsConfig: {
          circleRadius: 5,
          xOffset: 0.95,
          yOffset: 0.05,
        },
        disableOnPassive: true,
        autoPan: {
          enabled: false,
          panSize: 10,
        },
        getReferenceLineColor: viewportId => {
          const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
          const viewportOptions = viewportInfo?.viewportOptions;
          if (viewportOptions) {
            return (
              colours[viewportOptions.id] ||
              colorsByOrientation[viewportOptions.orientation] ||
              '#0c0'
            );
          } else {
            console.warn('missing viewport?', viewportId);
            return '#0c0';
          }
        },
      },
    },
    { toolName: utilityModule.exports.toolNames.ReferenceLines }
  );
  toolGroupService.createToolGroupAndAddTools('mpr', tools);
}

function initVolume3DToolGroup(extensionManager, toolGroupService) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );
  const tools = createTools(utilityModule);
  toolGroupService.createToolGroupAndAddTools('volume3d', tools);
}

function initSRToolGroup(extensionManager, toolGroupService) {
  const SRUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone-dicom-sr.utilityModule.tools'
  );
  
  if (!SRUtilityModule) {
    return;
  }

  const tools = {
    active: [
      {
        toolName: SRUtilityModule.exports.toolNames.SRLength,
        bindings: [{ mouseButton: 1 }],
      },
      {
        toolName: SRUtilityModule.exports.toolNames.SRBidirectional,
        bindings: [{ mouseButton: 1 }],
      },
      {
        toolName: SRUtilityModule.exports.toolNames.SRArrowAnnotate,
        bindings: [{ mouseButton: 1 }],
      },
    ],
    passive: [
      { toolName: SRUtilityModule.exports.toolNames.SRLength },
      { toolName: SRUtilityModule.exports.toolNames.SRBidirectional },
      { toolName: SRUtilityModule.exports.toolNames.SRArrowAnnotate },
    ],
    disabled: [],
  };

  toolGroupService.createToolGroupAndAddTools('SRToolGroup', tools);
}

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, 'default');
  initMPRToolGroup(extensionManager, toolGroupService, commandsManager);
  initVolume3DToolGroup(extensionManager, toolGroupService);
  initSRToolGroup(extensionManager, toolGroupService);
}

export default initToolGroups;
