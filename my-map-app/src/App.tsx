import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { toPoint } from "mgrs";
import * as tilebelt from "@mapbox/tilebelt";
import * as MarchingSquares from "marchingsquares";  // Namespace import

const MAPBOX_TOKEN = "YOUR_MAPBOX_TOKEN_HERE";
const ZOOM = 14;

// Decode RGB elevation
function decodeElevation(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

function TerrainContourMap() {
  const [contours, setContours] = useState<Array<Array<[number, number]>>>([]);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    const loadElevation = async () => {
      const mgrsCoord = "15SWC80826445"; // Example MGRS input
      const [lon, lat] = toPoint(mgrsCoord);
      const tile = tilebelt.pointToTile(lon, lat, ZOOM);
      const bbox = tilebelt.tileToBBOX(tile); // [minLng, minLat, maxLng, maxLat]
      setBbox([bbox[0], bbox[1], bbox[2], bbox[3]]);

      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tile[2]}/${tile[0]}/${tile[1]}.pngraw?access_token=pk.eyJ1IjoiYmtoZWJlcnQiLCJhIjoiY21idjB1c2p4MGs5dzJscTFwdXlqY2E3YSJ9.ac5ytr69UhIEwGFrKyX5Mw`;
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
    };

    loadElevation();
  }, []);

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {bbox && (
        <MapContainer
          center={[(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2]}
          zoom={ZOOM}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiYmtoZWJlcnQiLCJhIjoiY21idjB1c2p4MGs5dzJscTFwdXlqY2E3YSJ9.ac5ytr69UhIEwGFrKyX5Mw`}
            attribution="© Mapbox"
          />
          {contours.map((line, idx) => (
            <Polyline 
              key={idx} 
              positions={line} 
              pathOptions={{ color: "lime", weight: 1.2 }} 
            />
          ))}
        </MapContainer>
      )}
    </div>
  );
}

export default TerrainContourMap;