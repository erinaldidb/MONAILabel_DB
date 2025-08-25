import * as cornerstone from '@cornerstonejs/core';

function determinePixelDataInfo(metadata, imageId) {
  const {
    BitsAllocated,
    BitsStored,
    HighBit,
    PixelRepresentation,
    PhotometricInterpretation,
    SamplesPerPixel,
    PlanarConfiguration,
    Rows,
    Columns,
    NumberOfFrames,
    RescaleSlope,
    RescaleIntercept,
    WindowCenter,
    WindowWidth,
    PixelSpacing,
    SmallestImagePixelValue,
    LargestImagePixelValue,
    Modality
  } = metadata;

  // Valori base
  const rows = Rows || 1;
  const columns = Columns || 1;
  const samplesPerPixel = SamplesPerPixel || 1;
  const bitsAllocated = BitsAllocated || 16;
  const bitsStored = BitsStored || bitsAllocated;
  const pixelRepresentation = PixelRepresentation || 0;
  const photometricInterpretation = PhotometricInterpretation || 'MONOCHROME2';
  const rescaleSlope = RescaleSlope || 1;
  const rescaleIntercept = RescaleIntercept || 0;
  
  // Determina il tipo di dati
  let dataType;
  let TypedArrayConstructor;
  
  if (bitsAllocated === 8) {
    dataType = pixelRepresentation === 0 ? 'Uint8Array' : 'Int8Array';
    TypedArrayConstructor = pixelRepresentation === 0 ? Uint8Array : Int8Array;
  } else if (bitsAllocated === 16) {
    dataType = pixelRepresentation === 0 ? 'Uint16Array' : 'Int16Array';
    TypedArrayConstructor = pixelRepresentation === 0 ? Uint16Array : Int16Array;
  } else if (bitsAllocated === 32) {
    dataType = pixelRepresentation === 0 ? 'Uint32Array' : 'Int32Array';
    TypedArrayConstructor = pixelRepresentation === 0 ? Uint32Array : Int32Array;
  } else {
    dataType = 'Uint16Array'; // fallback
    TypedArrayConstructor = Uint16Array;
  }

  // Calcola min/max pixel values
  let minPixelValue = SmallestImagePixelValue || rescaleIntercept;
  let maxPixelValue = LargestImagePixelValue || (rescaleIntercept + 1580); // esempio per CT
  
  // Applica rescale se necessario per i valori di default
  if (rescaleSlope !== 1 || rescaleIntercept !== 0) {
    minPixelValue = minPixelValue * rescaleSlope + rescaleIntercept;
    maxPixelValue = maxPixelValue * rescaleSlope + rescaleIntercept;
  }

  // Pixel spacing
  const pixelSpacing = PixelSpacing || [1.0, 1.0];
  const rowPixelSpacing = pixelSpacing[0] || 1.0;
  const columnPixelSpacing = pixelSpacing[1] || 1.0;

  // Window/Level
  const windowCenter = Array.isArray(WindowCenter) ? WindowCenter[0] : (WindowCenter || 3577);
  const windowWidth = Array.isArray(WindowWidth) ? WindowWidth[0] : (WindowWidth || 7154);

  // Determina se l'immagine è a colori
  const isColor = samplesPerPixel > 1;
  const numberOfComponents = samplesPerPixel;

  // Calcola dimensioni
  const pixelsPerFrame = rows * columns;
  const bytesPerPixel = bitsAllocated / 8;
  const sizeInBytes = pixelsPerFrame * bytesPerPixel * samplesPerPixel;

  // Prescaling info
  const preScale = {
    enabled: rescaleSlope !== 1 || rescaleIntercept !== 0,
    scalingParameters: {
      rescaleSlope: rescaleSlope,
      rescaleIntercept: rescaleIntercept,
      modality: Modality || 'CT'
    },
    scaled: true
  };

  // Genera shared cache key dall'imageId
  const sharedCacheKey = imageId ? imageId.replace(/^[^:]+:/, '') : '';

  // Crea l'oggetto imageFrame
  const imageFrame = {
    samplesPerPixel: samplesPerPixel,
    photometricInterpretation: photometricInterpretation,
    rows: rows,
    columns: columns,
    bitsAllocated: bitsAllocated,
    bitsStored: bitsStored,
    pixelRepresentation: pixelRepresentation,
    smallestPixelValue: SmallestImagePixelValue || minPixelValue,
    largestPixelValue: LargestImagePixelValue || maxPixelValue,
    imageId: imageId,
    pixelDataLength: pixelsPerFrame, // Numero di pixel, non bytes
    preScale: preScale
  };

  // Oggetto principale compatibile con OHIF/Cornerstone
  const pixelDataInfo = {
    imageId: imageId,
    dataType: dataType,
    color: isColor,
    calibration: {}, // Vuoto per ora, può essere popolato se necessario
    columnPixelSpacing: columnPixelSpacing,
    columns: columns,
    height: rows,
    preScale: preScale,
    intercept: rescaleIntercept,
    slope: rescaleSlope,
    invert: photometricInterpretation === 'MONOCHROME1',
    minPixelValue: minPixelValue,
    maxPixelValue: maxPixelValue,
    rowPixelSpacing: rowPixelSpacing,
    rows: rows,
    sizeInBytes: sizeInBytes,
    width: columns,
    windowCenter: windowCenter,
    windowWidth: windowWidth,
    imageFrame: imageFrame,
    numberOfComponents: numberOfComponents,
    sharedCacheKey: sharedCacheKey,
    TypedArrayConstructor: TypedArrayConstructor,
    bytesPerPixel: bytesPerPixel,
    pixelsPerFrame: pixelsPerFrame
  };

  return pixelDataInfo;
}

function createCornerstoneImageFromInfo(pixelDataInfo, pixelData) {
  // Crea oggetto immagine utilizzando le info già calcolate
  return {
    imageId: pixelDataInfo.imageId,
    minPixelValue: pixelDataInfo.minPixelValue,
    maxPixelValue: pixelDataInfo.maxPixelValue,
    slope: pixelDataInfo.slope,
    intercept: pixelDataInfo.intercept,
    windowCenter: pixelDataInfo.windowCenter,
    windowWidth: pixelDataInfo.windowWidth,
    render: pixelDataInfo.color ? cornerstone.renderColorImage : cornerstone.renderGrayscaleImage,
    getPixelData: () => pixelData,
    rows: pixelDataInfo.rows,
    columns: pixelDataInfo.columns,
    height: pixelDataInfo.height,
    width: pixelDataInfo.width,
    color: pixelDataInfo.color,
    columnPixelSpacing: pixelDataInfo.columnPixelSpacing,
    rowPixelSpacing: pixelDataInfo.rowPixelSpacing,
    sizeInBytes: pixelDataInfo.sizeInBytes,
    invert: pixelDataInfo.invert,
    
    // Aggiungi info aggiuntive per compatibilità
    preScale: pixelDataInfo.preScale,
    imageFrame: pixelDataInfo.imageFrame,
    loadTimeInMS: pixelDataInfo.loadTimeInMS,
    totalTimeInMS: pixelDataInfo.totalTimeInMS
  };
}

function convertPixelDataToTypedArray(rawPixelData, pixelDataInfo) {
  // Convert ArrayBuffer to the correct typed array based on DICOM metadata
  const { TypedArrayConstructor, bytesPerPixel, pixelsPerFrame } = pixelDataInfo;
  
  // Create typed array view of the ArrayBuffer
  const typedArray = new TypedArrayConstructor(rawPixelData);
  
  // If the typed array length doesn't match expected pixels, we might need to handle endianness
  // or the data might be in a different format
  if (typedArray.length !== pixelsPerFrame) {
    console.warn(`Expected ${pixelsPerFrame} pixels but got ${typedArray.length} elements`);
  }
  
  return typedArray;
}

function applyRescaling(pixelData, slope, intercept) {
  if (slope === 1 && intercept === 0) {
    return pixelData;
  }
  
  const scaledData = new Float32Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i++) {
    scaledData[i] = pixelData[i] * slope + intercept;
  }
  return scaledData;
}

class MultiframeImageLoaderService {
  constructor() {
    this.name = 'MultiframeImageLoaderService';
    this.cache = new Map();
  }

  initialize() {
    // Registra il loader quando il servizio viene inizializzato
    cornerstone.registerImageLoader('multiframe', this.loadImage.bind(this));
    console.log('Multiframe Image Loader registered');
  }

  loadImage(imageId) {
    return new Promise((resolve, reject) => {
      console.log("loadImage", imageId)
      const [fileUrl, frameNumber] = imageId.split('&frame=');
      
      // Check cache first
      const cacheKey = `${fileUrl}_${frameNumber}`;
      if (this.cache.has(cacheKey)) {
        resolve(this.cache.get(cacheKey));
        return;
      }

      // Fetch frame data
      this.fetchFrame(fileUrl, frameNumber)
        .then(image => {
          this.cache.set(cacheKey, image);
          resolve(image);
        })
        .catch(reject);
    });
  }

  async fetchFrame(fileUrl, frameNumber) {
    try {
      // Carica metadati se non già disponibili
      let metadata = cornerstone.metaData.get('instance', fileUrl);

      if (!metadata) {
        const metadataResponse = await fetch(
          `${fileUrl.replace('multiframe:', '')}/metadata`
        );
        metadata = await metadataResponse.json();

        console.log("metadata", metadata)

        // Registra metadati in cornerstone
        cornerstone.metaData.addProvider((type, imageId) => {
          if (type === 'instance') {
            return metadata;
          }
        });
      }

      // Carica pixel data del frame
      const frameResponse = await fetch(
        `${fileUrl.replace('multiframe:', '')}&frame=${frameNumber}`
      );
      
      const rawPixelData = await frameResponse.arrayBuffer();

      const pixelDataInfo = determinePixelDataInfo(metadata, `${fileUrl}&frame=${frameNumber}`);

      // Convert raw pixel data to the correct typed array
      const typedPixelData = convertPixelDataToTypedArray(rawPixelData, pixelDataInfo);

      let processedPixelData = typedPixelData;

      if (pixelDataInfo.preScale.enabled) {
        processedPixelData = applyRescaling(
          typedPixelData, 
          pixelDataInfo.slope, 
          pixelDataInfo.intercept
        );
      }

      pixelDataInfo.getPixelData = () => processedPixelData
      return pixelDataInfo
      
    } catch (error) {
      console.error('Error loading frame:', error);
      throw error;
    }
  }
}

export default MultiframeImageLoaderService;