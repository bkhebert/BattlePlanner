/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* @ts-nocheck */
import { useEffect, useState, useRef } from "react";
import { MapScreenshot } from "../components/MapScreenShot";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../App.css';
import { toPoint } from "mgrs";
import * as tilebelt from "@mapbox/tilebelt";
import * as MarchingSquares from "marchingsquares";
import axios from "axios";
import baseURL from "../constants/constant";
// Initialize Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoiYmtoZWJlcnQiLCJhIjoiY21idjB1c2p4MGs5dzJscTFwdXlqY2E3YSJ9.ac5ytr69UhIEwGFrKyX5Mw';
//const ZOOM = 14;
const ZOOM = 16;

interface UnitType {
  name?: string;
  label?: string;
  iconColor: string;
  symbol: string;
  type?: string;
  shape?: string;
}

const UNIT_TYPES: Record<string, UnitType> = {
  infantry: { name: "Infantry", iconColor: "#4CAF50", symbol: "I" },
  tank: { name: "Tank", iconColor: "#F44336", symbol: "T" },
  artillery: { name: "Artillery", iconColor: "#2196F3", symbol: "A" },
  hq: { name: "HQ", iconColor: "#9C27B0", symbol: "HQ" },
  enemy: { label: "Enemy Unit", iconColor: "#FF0000", symbol: "▲", shape: "triangle" },
  enemyZone: { label: "Enemy Zone", iconColor: "rgba(255, 0, 0, 0.3)", symbol: null, type: "circle-zone" },
  safeZone: { label: "Safe Zone", iconColor: "rgba(0, 255, 0, 0.3)", symbol: null,  type: "circle-zone" },
};

// Helper functions
const decodeElevation = (r: number, g: number, b: number): number => {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
};

const createMarkerElement = (unitType: any) => {
  const el = document.createElement('div');
  el.className = 'unit-marker';
  const unitData = UNIT_TYPES[unitType];
  
  el.innerHTML = unitData.symbol;
  el.style.backgroundColor = unitData.iconColor;
  el.style.borderRadius = unitType === 'hq' ? '4px' : '50%';
  el.style.width = '24px';
  el.style.height = '24px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.color = 'white';
  el.style.fontWeight = 'bold';
  el.style.border = '2px solid white';

  if (unitType === 'enemy') {
    el.style.width = '0';
    el.style.height = '0';
    el.style.borderLeft = '12px solid transparent';
    el.style.borderRight = '12px solid transparent';
    el.style.borderBottom = '24px solid red';
    el.style.backgroundColor = 'transparent';
  }

  return el;
};

const ThreeDeeMap = () => {
  // State
  const [selectedElementType, setSelectedElementType] = useState<any>('infantry');
  const [slideshowPlans, setSlideshowPlans] = useState<any[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [contours, setContours] = useState<Array<Array<[number, number]>>>([]);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [mgrsCoord, setMgrsCoord] = useState("15RYP81881486");
  const [units, setUnits] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [planName, setPlanName] = useState('');
  const [savedPlans, setSavedPlans] = useState<any[]>([]);
  const [isAddingUnits, setIsAddingUnits] = useState(false);
  
  // Refs
  const mapContainer = useRef<HTMLDivElement>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-90.0715, 29.9511],
      zoom: ZOOM,
      pitch: 45,
      bearing: 0,
      antialias: true,
      preserveDrawingBuffer: true
    });

    const setupMapLayers = () => {
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
    };

    mapInstance.on('load', () => {
      setupMapLayers();
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
      const el = createMarkerElement(unit.type);
      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([unit.position[1], unit.position[0]])
        .addTo(map);

      // Create popup content
      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
        <div>
          <strong>${UNIT_TYPES[unit.type].name}</strong><br />
          Position: ${unit.position[0].toFixed(4)}, ${unit.position[1].toFixed(4)}<br />
          <button class="delete-unit-btn" data-id="${unit.id}">
            Delete
          </button>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupContent);
      marker.setPopup(popup);

      // Handle drag events
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        setUnits(prev => prev.map(u => 
          u.id === unit.id ? { ...u, position: [lngLat.lat, lngLat.lng] } : u
        ));
      });

      (marker as any).unitId = unit.id;

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

  // Handle zones
  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Clear existing zone layers
    const zoneLayerIds = ['enemy-zones', 'safe-zones'];
    zoneLayerIds.forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    const enemyZones = zones.filter(z => z.type === 'enemyZone');
    const safeZones = zones.filter(z => z.type === 'safeZone');

    const makeGeoJSON = (zoneArray: any[]) => ({
      type: "FeatureCollection",
      features: zoneArray.map(zone => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [zone.center[1], zone.center[0]]
        },
        properties: {
          radius: zone.radiusMeters
        }
      }))
    });

    const addCircleLayer = (id: string, data: any, color: string) => {
      map.addSource(id, {
        type: 'geojson',
        data
      });
      map.addLayer({
        id,
        type: 'circle',
        source: id,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            10, ['/', ['get', 'radius'], 2],
            14, ['get', 'radius']
          ],
          'circle-color': color,
          'circle-opacity': 0.4
        }
      });
    };

    if (enemyZones.length) addCircleLayer('enemy-zones', makeGeoJSON(enemyZones), 'rgba(255,0,0,0.3)');
    if (safeZones.length) addCircleLayer('safe-zones', makeGeoJSON(safeZones), 'rgba(0,255,0,0.3)');
  }, [zones, map, mapLoaded]);

  // Handle click events for adding units/zones
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isAddingUnits) return;
      const selected = UNIT_TYPES[selectedElementType];

      if (selected.type === 'circle-zone') {
        // Add a zone
        const newZone = {
          id: Date.now(),
          type: selectedElementType,
          center: [e.lngLat.lat, e.lngLat.lng],
          radiusMeters: 150
        };
        setZones(prev => [...prev, newZone]);
      } else {
        // Add a unit
        const newUnit = {
          id: Date.now(),
          type: selectedElementType,
          position: [e.lngLat.lat, e.lngLat.lng],
        };
        setUnits(prev => [...prev, newUnit]);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, mapLoaded, isAddingUnits, selectedElementType]);

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

  // Slideshow functions
  const addToSlideshow = (plan: any) => {
    setSlideshowPlans(prev => [...prev, plan]);
  };

  const removeFromSlideshow = (index: number) => {
    setSlideshowPlans(prev => prev.filter((_, i) => i !== index));
  };

  const startSlideshow = async () => {
    if (slideshowPlans.length === 0) return;
    setCurrentSlideIndex(0);
    setIsSlideshowActive(true);
    await loadPlan(slideshowPlans[0]);
  };

  const nextSlide = async () => {
    if (currentSlideIndex < slideshowPlans.length - 1) {
      const from = slideshowPlans[currentSlideIndex];
      const to = slideshowPlans[currentSlideIndex + 1];
      await animateUnitsBetweenSlides(from, to);
      setCurrentSlideIndex(prev => prev + 1);
    }
  };

  const prevSlide = async () => {
    if (currentSlideIndex > 0) {
      const from = slideshowPlans[currentSlideIndex];
      const to = slideshowPlans[currentSlideIndex - 1];
      await animateUnitsBetweenSlides(from, to);
      setCurrentSlideIndex(i => i - 1);
    }
  };

  // Load saved plan
  const loadPlan = async (plan: any) => {
    try {
      const parsedUnits = typeof plan.units === 'string' 
        ? JSON.parse(plan.units) 
        : plan.units;
      const parsedContours = typeof plan.contours === 'string'
        ? JSON.parse(plan.contours)
        : plan.contours;

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
        const response = await fetch(`${baseURL}/api/battle/plans`, { 
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
        `${baseURL}/api/battle/saveBattlePlan`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (res.status === 201) {
        alert('Battle plan saved successfully!');
        const plansResponse = await fetch(`${baseURL}/api/battle/plans`);
        const plans = await plansResponse.json();
        setSavedPlans(plans);
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save battle plan');
    }
  };

  // Unit animation between slides
  const animateUnitsBetweenSlides = async (fromPlan: any, toPlan: any) => {
    if (!map) return;

    const fromUnits: any[] = typeof fromPlan.units === 'string' ? JSON.parse(fromPlan.units) : fromPlan.units;
    const toUnits: any[] = typeof toPlan.units === 'string' ? JSON.parse(toPlan.units) : toPlan.units;
    const fromMap = new Map(fromUnits.map(u => [u.id, u]));
    const toMap = new Map(toUnits.map(u => [u.id, u]));
    const nextUnits: any[] = [];
    const animations: Promise<void>[] = [];

    for (const unit of fromUnits) {
      const marker = markersRef.current.find(m => (m as any).unitId === unit.id);

      if (!toMap.has(unit.id)) {
        // Fade out
        const el = marker?.getElement();
        if (el) {
          el.style.transition = 'opacity 1s';
          el.style.opacity = '0';
        }
        continue;
      }

      const dest = toMap.get(unit.id);
      const start = unit.position;
      const end = dest.position;
      const duration = 1000;
      const startTime = performance.now();

      animations.push(new Promise<void>(resolve => {
        const step = (now: number) => {
          let t = Math.min((now - startTime) / duration, 1);
          t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const lat = start[0] + (end[0] - start[0]) * t;
          const lng = start[1] + (end[1] - start[1]) * t;
          marker?.setLngLat([lng, lat]);

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      }));

      nextUnits.push(dest);
    }

    // Add new units that didn't exist before
    for (const unit of toUnits) {
      if (!fromMap.has(unit.id)) {
        const el = createMarkerElement(unit.type);
        el.style.opacity = '0';

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([unit.position[1], unit.position[0]])
          .addTo(map);

        (marker as any).unitId = unit.id;

        requestAnimationFrame(() => {
          el.style.transition = 'opacity 1s';
          el.style.opacity = '1';
        });

        markersRef.current.push(marker);
        nextUnits.push(unit);
      }
    }

    await Promise.all(animations);
    setUnits(nextUnits);
  };

  // Initial elevation load
  useEffect(() => {
    loadElevation(mgrsCoord);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: '280px', padding: '1rem', backgroundColor: '#111', color: 'white' }}>
        <h2>Battle Planner</h2>
        
        <div>
          <label>MGRS Coord:</label>
          <input value={mgrsCoord} onChange={e => setMgrsCoord(e.target.value)} />
          <button onClick={() => loadElevation(mgrsCoord)}>Load Terrain</button>
        </div>
        
        <hr />
        
        <div>
          <label>Element Type:</label>
          <select 
            value={selectedElementType} 
            onChange={e => setSelectedElementType(e.target.value as any)}
          >
            {Object.entries(UNIT_TYPES).map(([key, value]) => (
              <option key={key} value={key}>{value.name || value.label}</option>
            ))}
          </select>
          <button onClick={() => setIsAddingUnits(!isAddingUnits)}>
            {isAddingUnits ? 'Cancel' : 'Add Units'}
          </button>
        </div>
        
        <hr />
        
        <div>
          <label>Plan Name:</label>
          <input value={planName} onChange={e => setPlanName(e.target.value)} />
          <button onClick={() => savePlanToDatabase()}>Save Plan</button>
          <button onClick={() => handleScreenshot()}>Take Screenshot</button>
        </div>
        
        <hr />
        
        <div>
          <h4>Slideshow Queue</h4>
          <ul>
            {slideshowPlans.map((plan, index) => (
              <li key={plan.id || index}>
                {plan.name}
                <button 
                  onClick={() => removeFromSlideshow(index)}
                  className="delete-btn"
                >
                  X
                </button>
              </li>
            ))}
          </ul>

          {savedPlans.map(plan => (
            <button 
              key={`queue-${plan.id}`} 
              onClick={() => addToSlideshow(plan)}
              className="add-btn"
            >
              ➕ {plan.name}
            </button>
          ))}

          <div className="slideshow-controls">
            <button 
              onClick={startSlideshow} 
              disabled={slideshowPlans.length === 0}
            >
              ▶ Start Slideshow
            </button>
            <div>
              <button 
                onClick={prevSlide} 
                disabled={currentSlideIndex === 0 || !isSlideshowActive}
              >
                ⬅ Prev
              </button>
              <button 
                onClick={nextSlide} 
                disabled={currentSlideIndex >= slideshowPlans.length - 1 || !isSlideshowActive}
              >
                Next ➡
              </button>
            </div>
            {isSlideshowActive && (
              <div>
                <strong>Slide:</strong> {currentSlideIndex + 1}/{slideshowPlans.length}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h4>Saved Plans</h4>
          <ul>
            {savedPlans.map(plan => (
              <li key={plan.id || plan.name}>
                <button onClick={() => loadPlan(plan)}>{plan.name}</button>
                <button onClick={() => addToSlideshow(plan)}>+ Slideshow</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div ref={mapContainer} style={{ flex: 1 }} />
    </div>
  );
};

export default ThreeDeeMap;