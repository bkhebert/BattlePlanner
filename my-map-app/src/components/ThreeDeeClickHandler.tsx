import { useEffect } from 'react';
// import mapboxgl from 'mapbox-gl';

function ThreeDeeClickHandler({ map, onClick }) {
 useEffect(() => {
    if (!map) return;

    const handleClick = (e) => {
      // Mapbox returns lngLat format {lng, lat} instead of Leaflet's latLng
      onClick({ 
        lat: e.lngLat.lat, 
        lng: e.lngLat.lng,
        originalEvent: e // Pass through the original event if needed
      });
    };

    map.on('click', handleClick);
    
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onClick]);

  return null;
}

export default ThreeDeeClickHandler