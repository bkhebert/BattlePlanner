import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

function ThreeDeeRecentering({ map, bbox, pitch = 45, bearing = 0 }) {
  useEffect(() => {
    if (!map || !bbox) return;

    const center = [
      (bbox[0] + bbox[2]) / 2, // lng
      (bbox[1] + bbox[3]) / 2  // lat
    ];

    map.flyTo({
      center,
      zoom: map.getZoom(), // Added 3D perspective
      pitch,    // Added 3D perspective
      bearing,  // Added for orientation
      essential: true // Ensures animation happens even if tab is inactive
    });
  }, [bbox, map, pitch, bearing]);

  return null;
}

export default ThreeDeeRecentering;