import { useMap } from 'react-leaflet';
import { useEffect } from 'react';

function MapRecentering({ bbox }: { bbox: [number, number, number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (bbox) {
      const lat = (bbox[1] + bbox[3]) / 2;
      const lng = (bbox[0] + bbox[2]) / 2;
      map.flyTo([lat, lng], map.getZoom());
    }
  }, [bbox, map]);

  return null;
}

export default MapRecentering