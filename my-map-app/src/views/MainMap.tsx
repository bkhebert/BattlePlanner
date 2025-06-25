import { useEffect, useState, useRef } from "react";
import { MapScreenshot } from "../components/MapScreenShot";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import { toPoint } from "mgrs";
import * as tilebelt from "@mapbox/tilebelt";
import * as MarchingSquares from "marchingsquares";
import MapClickHandler from "../components/MapClickHandler";
import axios from "axios";
import MapRecentering from "../components/MapRecentering";

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmtoZWJlcnQiLCJhIjoiY21idjB1c2p4MGs5dzJscTFwdXlqY2E3YSJ9.ac5ytr69UhIEwGFrKyX5Mw';
const ZOOM = 14;

// Military unit types with icons
const UNIT_TYPES = {
  infantry: { name: "Infantry", iconColor: "#4CAF50", symbol: "I" },
  tank: { name: "Tank", iconColor: "#F44336", symbol: "T" },
  artillery: { name: "Artillery", iconColor: "#2196F3", symbol: "A" },
  hq: { name: "HQ", iconColor: "#9C27B0", symbol: "HQ" }
};

// Decode RGB elevation
function decodeElevation(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}
function TerrainContourMap() {
  const [clickedLatLng, setClickedLatLng] = useState(null);
  const [contours, setContours] = useState<Array<Array<[number, number]>>>([]);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [mgrsCoord, setMgrsCoord] = useState("15RYP81881486"); // Default MGRS
  const [units, setUnits] = useState<Array<{
    id: string;
    position: [number, number];
    type: keyof typeof UNIT_TYPES;
  }>>([]);
  const [selectedUnitType, setSelectedUnitType] = useState<keyof typeof UNIT_TYPES>("infantry");
  const [isAddingUnits, setIsAddingUnits] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [planName, setPlanName] = useState('');
  const [savedPlans, setSavedPlans] = useState([]);
  // const handleMapClick = (latlng) => {
  //      setClickedLatLng(latlng);
  //      console.log('Clicked at:', latlng);
  //      console.log(clickedLatLng)
  //    };
  useEffect(() => {
  const fetchPlans = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/battle/plans',{ 
        headers: {
        'Content-Type': 'application/json',
      }});
      const plans = await response.json();
      setSavedPlans(plans);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };
  fetchPlans();
}, []);

const savePlanToDatabase = async (blob: Blob) => {
  try {
    const formData = new FormData();
    formData.append('image', blob, `${planName || 'battle-plan'}.png`);
    formData.append('name', planName || `Plan-${new Date().toISOString()}`);
    formData.append('mgrsCoord', mgrsCoord);
    formData.append('units', JSON.stringify(units));
    formData.append('contours', JSON.stringify(contours));

    const response = await axios.post(
      'http://localhost:3000/api/battle/saveBattlePlan',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (response.status === 201) {
      alert('Battle plan saved successfully!');
      // Refresh the saved plans list
      const plansResponse = await fetch('http://localhost:3000/api/battle/plans', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const plans = await plansResponse.json();
      setSavedPlans(plans);
    }
  } catch (error) {
    console.error('Error saving plan:', error);
    alert('Failed to save battle plan');
  }
};
  // Create custom unit icons
  const createUnitIcon = (type: keyof typeof UNIT_TYPES) => {
    const { iconColor, symbol } = UNIT_TYPES[type];
    return L.divIcon({
      className: 'custom-icon',
      html: `<div style="
        background-color: ${iconColor};
        width: 24px;
        height: 24px;
        border-radius: ${type === 'hq' ? '4px' : '50%'};
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${symbol.length > 1 ? '10px' : '12px'};
      ">${symbol}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  const loadPlan = async (plan) => {
  try {
    setMgrsCoord(plan.mgrsCoord);
    
    // Parse the units and contours from JSON strings
    const parsedUnits = typeof plan.units === 'string' 
      ? JSON.parse(plan.units) 
      : plan.units;
      
    const parsedContours = typeof plan.contours === 'string'
      ? JSON.parse(plan.contours)
      : plan.contours;
    
    setUnits(parsedUnits);
    setContours(parsedContours);
    await loadElevation(plan.mgrsCoord);
  } catch (error) {
    console.error('Error loading plan:', error);
    alert('Failed to load battle plan');
  }
};
  // Load elevation data based on MGRS coordinates
  const loadElevation = async (mgrsInput: string) => {
    try {
      const [lon, lat] = toPoint(mgrsInput);
      const tile = tilebelt.pointToTile(lon, lat, ZOOM);
      const bbox = tilebelt.tileToBBOX(tile);
      setBbox([bbox[0], bbox[1], bbox[2], bbox[3]]);

      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}.pngraw?access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      ctx.drawImage(bitmap, 0, 0);

      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
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

      const levels = [100, 200, 300, 400, 500];
      const allContours: Array<Array<[number, number]>> = [];
      for (const level of levels) {
        const lines = MarchingSquares.isoLines(grid, level);
        for (const line of lines) {
          const latlngs = line.map((item: [number, number]) => {
            const [px, py] = item;
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

  // // Handle map click for unit placement
  const handleMapClick = (latlng) => {
    if (!isAddingUnits || !bbox) return;
    setClickedLatLng(latlng);
     console.log(clickedLatLng)
    setUnits(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        position: [latlng.lat, latlng.lng],
        type: selectedUnitType
      }
    ]);
  };

  // Handle coordinate submission
  const handleCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadElevation(mgrsCoord);
  };

  // Delete a unit
  const deleteUnit = (id: string) => {
    setUnits(prev => prev.filter(unit => unit.id !== id));
  };

  useEffect(() => {
    loadElevation(mgrsCoord);
  }, []);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex' }}>
      {/* Control Panel */}
      <div style={{
        width: '300px',
        padding: '20px',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #ddd',
        overflowY: 'auto'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h3>Save Plan</h3>
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="Plan name"
            style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
  <h3>Saved Plans</h3>
  {savedPlans.length === 0 ? (
    <p>No saved plans</p>
  ) : (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {savedPlans.map(plan => (
        <li key={plan.id} style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{plan.name}</span>
            <button 
              onClick={() => loadPlan(plan)}
              style={{
                padding: '2px 6px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Load
            </button>
          </div>
          <small>{new Date(plan.createdAt).toLocaleString()}</small>
        </li>
      ))}
    </ul>
  )}
</div>
        <h2>Battle Planner</h2>
        
        {/* Coordinate Input */}
        <form onSubmit={handleCoordinateSubmit} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="mgrsCoord" style={{ display: 'block', marginBottom: '5px' }}>
              MGRS Coordinates:
            </label>
            <input
              id="mgrsCoord"
              type="text"
              value={mgrsCoord}
              onChange={(e) => setMgrsCoord(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
              placeholder="Enter 6-digit MGRS (e.g., 15SWC80826445)"
            />
          </div>
          <button 
            type="submit" 
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Map
          </button>
        </form>

        {/* Unit Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3>Unit Placement</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button
              onClick={() => setIsAddingUnits(!isAddingUnits)}
              style={{
                padding: '8px 12px',
                backgroundColor: isAddingUnits ? '#F44336' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                flex: 1
              }}
            >
              {isAddingUnits ? 'Cancel Placement' : 'Add Units'}
            </button>
          </div>

          {isAddingUnits && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {Object.entries(UNIT_TYPES).map(([type, { name, iconColor, symbol }]) => (
                <div
                  className={`${symbol}`}
                  key={type}
                  onClick={() => setSelectedUnitType(type as keyof typeof UNIT_TYPES)}
                  style={{
                    padding: '10px',
                    backgroundColor: selectedUnitType === type ? iconColor : '#eee',
                    color: selectedUnitType === type ? 'white' : '#333',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: `2px solid ${selectedUnitType === type ? 'black' : 'transparent'}`
                  }}
                >
                  {name}
                </div>
                
              ))}
            </div>
          )}
        </div>

        {/* Unit List */}
        <div>
          <h3>Placed Units ({units.length})</h3>
          {units.length === 0 ? (
            <p>No units placed yet</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {units.map(unit => (
                <li 
                  key={unit.id} 
                  style={{
                    padding: '8px',
                    marginBottom: '5px',
                    backgroundColor: UNIT_TYPES[unit.type].iconColor,
                    color: 'white',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>{UNIT_TYPES[unit.type].name}</span>
                  <button 
                    onClick={() => deleteUnit(unit.id)}
                    style={{
                      backgroundColor: 'white',
                      color: UNIT_TYPES[unit.type].iconColor,
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} style={{ flex: 1, height: '100%' }}>
        {bbox && (
          <MapContainer
            center={[(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2]}
            zoom={ZOOM}
            minZoom={10}  // Prevents zooming too far out
            maxZoom={18}  // Prevents over-zooming
            zoomControl={false} // Add custom controls later
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
            // onClick={handleMapClick}
            >
            <TileLayer
              url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
              attribution="© Mapbox"
            />
            <MapRecentering bbox={bbox} />
            <MapScreenshot 
              mapContainerRef={mapContainerRef} 
              onCapture={savePlanToDatabase} 
            />
            
            <MapClickHandler onClick={handleMapClick} />
            
            {/* Contour Lines */}
            {contours.map((line, idx) => (
              <Polyline 
                key={idx} 
                positions={line} 
                pathOptions={{ color: "lime", weight: 1.2 }} 
              />
            ))}
            {/* Military Units */}
            {units.map(unit => (
              <Marker
                key={unit.id}
                position={unit.position}
                icon={createUnitIcon(unit.type)}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    setUnits(prev => prev.map(u => 
                      u.id === unit.id 
                        ? {...u, position: [position.lat, position.lng]} 
                        : u
                    ));
                  }
                }}
              >
                <Popup>
                  <div>
                    <strong>{UNIT_TYPES[unit.type].name}</strong><br />
                    Position: {unit.position[0].toFixed(4)}, {unit.position[1].toFixed(4)}<br />
                    <button 
                      onClick={() => deleteUnit(unit.id)}
                      style={{
                        marginTop: '5px',
                        padding: '2px 8px',
                        backgroundColor: '#ff4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

export default TerrainContourMap;