import { useEffect, useState, useRef } from "react";
import { MapScreenshot } from "../components/MapScreenShot";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../App.css';
import { toPoint } from "mgrs";
import * as tilebelt from "@mapbox/tilebelt";
import * as MarchingSquares from "marchingsquares";
import axios from "axios";

// Initialize Mapbox
mapboxgl.accessToken = '';
const ZOOM = 14;

const UNIT_TYPES = {
  infantry: { name: "Infantry", iconColor: "#4CAF50", symbol: "I" },
  tank: { name: "Tank", iconColor: "#F44336", symbol: "T" },
  artillery: { name: "Artillery", iconColor: "#2196F3", symbol: "A" },
  hq: { name: "HQ", iconColor: "#9C27B0", symbol: "HQ" }
};

function decodeElevation(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

function ThreeDeeMap() {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [contours, setContours] = useState<Array<Array<[number, number]>>>([]);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [mgrsCoord, setMgrsCoord] = useState("15RYP81881486");
  const [units, setUnits] = useState<Array<{
    id: string | number;
    position: [number, number];
    type: keyof typeof UNIT_TYPES;
  }>>([]);
  const [selectedUnitType, setSelectedUnitType] = useState<keyof typeof UNIT_TYPES>("infantry");
  const [isAddingUnits, setIsAddingUnits] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const [planName, setPlanName] = useState('');
  const [savedPlans, setSavedPlans] = useState<any[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-90.0715, 29.9511], // New Orleans coordinates
      zoom: ZOOM,
      pitch: 45,
      bearing: 0,
      antialias: true,
      preserveDrawingBuffer: true
    });

    mapInstance.on('load', () => {
      // Add terrain
      mapInstance.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.terrain-rgb'
      });
      
      mapInstance.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
      
      // Add 3D buildings
      mapInstance.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#aaa',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.6
        }
      });

      // Add sky layer
      mapInstance.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      // Set lighting
      mapInstance.setLight({
        anchor: 'viewport',
        position: [1.15, 210, 30],
        intensity: 0.5
      });

      setMap(mapInstance);
      setMapLoaded(true);
    });

    return () => {
      mapInstance.remove();
      setMap(null);
      setMapLoaded(false);
    };
  }, []);

  // Handle unit markers
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Clear existing markers and popups
    markersRef.current.forEach(marker => marker.remove());
    popupsRef.current.forEach(popup => popup.remove());
    markersRef.current = [];
    popupsRef.current = [];

    // Create new markers with popups
    units.forEach(unit => {
      const el = document.createElement('div');
      el.className = 'unit-marker';
      el.style.backgroundColor = UNIT_TYPES[unit.type].iconColor;
      el.style.borderRadius = unit.type === 'hq' ? '4px' : '50%';
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.border = '2px solid white';
      el.innerHTML = UNIT_TYPES[unit.type].symbol;

      // Create marker
      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true
      })
        .setLngLat([unit.position[1], unit.position[0]])
        .addTo(map);

      // Create popup content
      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
        <div>
          <strong>${UNIT_TYPES[unit.type].name}</strong><br />
          Position: ${unit.position[0].toFixed(4)}, ${unit.position[1].toFixed(4)}<br />
          <button class="delete-unit-btn" data-id="${unit.id}" style="
            margin-top: 5px;
            padding: 2px 8px;
            background-color: #ff4444;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
          ">
            Delete
          </button>
        </div>
      `;

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setDOMContent(popupContent);

      // Attach popup to marker
      marker.setPopup(popup);

      // Handle drag events
      marker.getElement().addEventListener('dragend', () => {
        const lngLat = marker.getLngLat();
        setUnits(prev => prev.map(u => 
          u.id === unit.id ? { ...u, position: [lngLat.lat, lngLat.lng] } : u
        ));
      });

      // Handle delete button click
      popupContent.querySelector('.delete-unit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteUnit(unit.id);
      });

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });
  }, [units, map, mapLoaded]);

  // Handle contour lines
  useEffect(() => {
    if (!map || !mapLoaded || !contours.length) return;

    // Remove existing layer if it exists
    if (map.getSource('contours')) {
      map.removeLayer('contours');
      map.removeSource('contours');
    }

    // Add new contour source and layer
    map.addSource('contours', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: contours.map(line => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: line.map(([lat, lng]) => [lng, lat])
          },
          properties: {}
        }))
      }
    });

    map.addLayer({
      id: 'contours',
      type: 'line',
      source: 'contours',
      paint: {
        'line-color': 'lime',
        'line-width': 1.2
      }
    });
  }, [contours, map, mapLoaded]);

  // Handle click events for adding units
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isAddingUnits) return;
      
      setUnits(prev => [
        ...prev,
        {
          id: Date.now(),
          position: [e.lngLat.lat, e.lngLat.lng],
          type: selectedUnitType
        }
      ]);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, mapLoaded, isAddingUnits, selectedUnitType]);

  // Load elevation data
  const loadElevation = async (mgrsInput: string) => {
    try {
      const [lon, lat] = toPoint(mgrsInput);
      const tile = tilebelt.pointToTile(lon, lat, ZOOM);
      const bbox = tilebelt.tileToBBOX(tile);
      setBbox([bbox[0], bbox[1], bbox[2], bbox[3]]);

      // Center map on the new location
      if (map) {
        map.flyTo({
          center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
          zoom: ZOOM,
          essential: true
        });
      }

      // Fetch elevation data
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}.pngraw?access_token=${mapboxgl.accessToken}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);

      // Process elevation data
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      // Generate elevation grid
      const grid: number[][] = [];
      for (let y = 0; y < 256; y++) {
        const row: number[] = [];
        for (let x = 0; x < 256; x++) {
          const i = (y * 256 + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const elev = decodeElevation(r, g, b);
          row.push(elev);
        }
        grid.push(row);
      }

      // Generate contour lines
      const levels = [100, 200, 300, 400, 500];
      const allContours: Array<Array<[number, number]>> = [];
      for (const level of levels) {
        const lines = MarchingSquares.isoLines(grid, level);
        for (const line of lines) {
          const latlngs = line.map(([px, py]) => {
            const lng = bbox[0] + (px / 255) * (bbox[2] - bbox[0]);
            const lat = bbox[3] - (py / 255) * (bbox[3] - bbox[1]);
            return [lat, lng] as [number, number];
          });
          allContours.push(latlngs);
        }
      }

      setContours(allContours);
    } catch (error) {
      console.error("Error loading elevation data:", error);
      alert("Invalid MGRS coordinates. Please try again.");
    }
  };

  // Load saved plan
  const loadPlan = async (plan: any) => {
    try {
      // Parse the data first
      const parsedUnits = typeof plan.units === 'string' 
        ? JSON.parse(plan.units) 
        : plan.units;
      const parsedContours = typeof plan.contours === 'string'
        ? JSON.parse(plan.contours)
        : plan.contours;

      // Set MGRS and load elevation first
      setMgrsCoord(plan.mgrsCoord);
      await loadElevation(plan.mgrsCoord);

      // Wait for map to be ready if needed
      if (!map || !map.isStyleLoaded()) {
        await new Promise(resolve => {
          const checkMap = () => {
            if (map && map.isStyleLoaded()) {
              resolve(true);
            } else {
              setTimeout(checkMap, 100);
            }
          };
          checkMap();
        });
      }

      // Now update the state
      setUnits(parsedUnits);
      setContours(parsedContours);

    } catch (error) {
      console.error('Error loading plan:', error);
      alert('Failed to load battle plan');
    }
  };

  // Fetch saved plans
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/battle/plans', { 
          headers: {
            'Content-Type': 'application/json',
          }
        });
        const plans = await response.json();
        setSavedPlans(plans);
      } catch (error) {
        console.error('Error loading plans:', error);
      }
    };
    fetchPlans();
  }, []);

  // Delete a unit
  const deleteUnit = (id: string | number) => {
    setUnits(prev => prev.filter(unit => unit.id !== id));
  };

  // Handle coordinate submission
  const handleCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadElevation(mgrsCoord);
  };

  // Take screenshot
  const handleScreenshot = () => {
    if (!map) return;
    const canvas = map.getCanvas();
    const dataURL = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = dataURL;
    a.download = `${planName || "battle-plan"}.png`;
    a.click();
  };

  // Save plan to database
  const savePlanToDatabase = async (blob?: Blob) => {
    try {
      let finalBlob = blob;

      if (!finalBlob && map) {
        const canvas = map.getCanvas();
        const dataURL = canvas.toDataURL("image/png");
        const response = await fetch(dataURL);
        finalBlob = await response.blob();
      }

      if (!finalBlob) {
        alert("Could not capture map screenshot.");
        return;
      }

      const formData = new FormData();
      formData.append('image', finalBlob, `${planName || 'battle-plan'}.png`);
      formData.append('name', planName || `Plan-${new Date().toISOString()}`);
      formData.append('mgrsCoord', mgrsCoord);
      formData.append('units', JSON.stringify(units));
      formData.append('contours', JSON.stringify(contours));

      const res = await axios.post(
        'http://localhost:3000/api/battle/saveBattlePlan',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (res.status === 201) {
        alert('Battle plan saved successfully!');
        const plansResponse = await fetch('http://localhost:3000/api/battle/plans');
        const plans = await plansResponse.json();
        setSavedPlans(plans);
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save battle plan');
    }
  };

  // Initial elevation load
  useEffect(() => {
    loadElevation(mgrsCoord);
  }, []);
return (
  <div style={{ display: 'flex', height: '100vh' }}>
    <div style={{ width: '280px', padding: '1rem', backgroundColor: '#111', color: 'white' }}>
      <h2>Battle Planner</h2>

      <label>MGRS Coord:</label>
      <input value={mgrsCoord} onChange={e => setMgrsCoord(e.target.value)} />
      <button onClick={() => loadElevation(mgrsCoord)}>Load Terrain</button>

      <hr />

      <label>Unit Type:</label>
      <select value={selectedUnitType} onChange={e => setSelectedUnitType(e.target.value)}>
        {Object.keys(UNIT_TYPES).map(key => (
          <option key={key} value={key}>{UNIT_TYPES[key].name}</option>
        ))}
      </select>
      <button onClick={() => setIsAddingUnits(!isAddingUnits)}>
        {isAddingUnits ? 'Cancel' : 'Add Units'}
      </button>

      <hr />

      <label>Plan Name:</label>
      <input value={planName} onChange={e => setPlanName(e.target.value)} />
      <button onClick={() => savePlanToDatabase()}>Save Plan</button>
      <button onClick={() => handleScreenshot()}>Take Screenshot</button>

      <hr />

      <h4>Saved Plans</h4>
      <ul>
        {savedPlans.map(plan => (
        <li key={plan.id || plan.name}>
      <button onClick={() => loadPlan(plan)}>{plan.name}</button>
    </li>
        ))}
      </ul>
    </div>

    <div ref={mapContainer} style={{ flex: 1 }} />
    <MapScreenshot 
  mapContainerRef={mapContainer} 
  onCapture={savePlanToDatabase}
/>
  </div>
);
}

export default ThreeDeeMap;
