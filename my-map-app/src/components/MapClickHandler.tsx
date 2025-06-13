   import { useMapEvents } from 'react-leaflet';

   function MapClickHandler({ onClick }) {
     const map = useMapEvents({
       click: (e) => {
         onClick(e.latlng);
       },
     });
   
     console.log(map)
     return null;
   }
   export default MapClickHandler;