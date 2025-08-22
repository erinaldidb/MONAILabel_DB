import * as cornerstone from '@cornerstonejs/core';

function determinePixelDataInfo(metadata) {
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
    NumberOfFrames
  } = metadata;

  // Determina il tipo di dati
  const pixelDataInfo = {
    samplesPerPixel: SamplesPerPixel || 1,
    photometricInterpretation: PhotometricInterpretation || 'MONOCHROME2',
    planarConfiguration: PlanarConfiguration || 0,
    bitsAllocated: BitsAllocated || 16,
    bitsStored: BitsStored || BitsAllocated || 16,
    highBit: HighBit || (BitsStored - 1) || 15,
    pixelRepresentation: PixelRepresentation || 0, // 0 = unsigned, 1 = signed
    rows: Rows,
    columns: Columns,
    numberOfFrames: NumberOfFrames || 1
  };

  // Determina il tipo di TypedArray necessario
  if (pixelDataInfo.bitsAllocated === 8) {
    pixelDataInfo.TypedArrayConstructor = pixelDataInfo.pixelRepresentation === 0 ? Uint8Array : Int8Array;
  } else if (pixelDataInfo.bitsAllocated === 16) {
    pixelDataInfo.TypedArrayConstructor = pixelDataInfo.pixelRepresentation === 0 ? Uint16Array : Int16Array;
  } else if (pixelDataInfo.bitsAllocated === 32) {
    pixelDataInfo.TypedArrayConstructor = pixelDataInfo.pixelRepresentation === 0 ? Uint32Array : Int32Array;
  }

  return pixelDataInfo;
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
      
      const arrayBuffer = await frameResponse.arrayBuffer();
      const pixelData = new Uint16Array(arrayBuffer);

      // Crea oggetto immagine compatibile con Cornerstone
      const image = {
        imageId: `${fileUrl}&frame=${frameNumber}`,
        minPixelValue: metadata.SmallestImagePixelValue || 0,
        maxPixelValue: metadata.LargestImagePixelValue || 255,
        slope: metadata.RescaleSlope || 1.0,
        intercept: metadata.RescaleIntercept || 0,
        windowCenter: metadata.WindowCenter || 3577,
        windowWidth: metadata.WindowWidth || 7154,
        getPixelData: () => pixelData,
        rows: metadata.Rows,
        columns: metadata.Columns,
        height: metadata.Rows,
        width: metadata.Columns,
        color: metadata.PhotometricInterpretation !== 'MONOCHROME1' && 
               metadata.PhotometricInterpretation !== 'MONOCHROME2',
        sizeInBytes: pixelData.length,
        spacing: metadata.PixelSpacing || [1, 1]
      };

      return image;
    } catch (error) {
      console.error('Error loading frame:', error);
      throw error;
    }
  }
}

export default MultiframeImageLoaderService;