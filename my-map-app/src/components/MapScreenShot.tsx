// Create a new component src/components/MapScreenshot.tsx

import * as domtoimage from 'dom-to-image';
import { saveAs } from 'file-saver';

interface MapScreenshotProps {
  mapContainerRef: React.RefObject<HTMLDivElement>;
  onCapture?: (blob: Blob) => void;
}

export function MapScreenshot({ mapContainerRef, onCapture }: MapScreenshotProps) {
  const captureMap = async () => {
    if (!mapContainerRef.current) return;
    
    try {
      const blob = await domtoimage.toBlob(mapContainerRef.current, {
        quality: 0.95,
        filter: (node) => {
          // Exclude controls from screenshot
          return !(node instanceof HTMLElement && 
                 (node.classList.contains('leaflet-control') || 
                  node.id === 'controls-sidebar'));
        }
      });
      
      if (onCapture) {
        onCapture(blob);
      } else {
        saveAs(blob, 'battle-plan.png');
      }
    } catch (error) {
      console.error('Error capturing map:', error);
    }
  };

  return (
    <button 
      onClick={captureMap}
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        padding: '8px 16px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      Save Battle Plan
    </button>
  );
}
