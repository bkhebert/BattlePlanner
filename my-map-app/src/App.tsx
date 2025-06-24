import { BrowserRouter, Routes, Route } from "react-router-dom";
import TerrainContourMap from "./views/MainMap";
import ThreeDeeMap from "./views/ThreeDeeMap";
const App = () => {
  return (
  <BrowserRouter>
  <Routes>
    <Route path="/MAINMAP" element={<TerrainContourMap/>}/>
    <Route path="/3DMAP" element={<ThreeDeeMap/>}></Route>
  </Routes>
  </BrowserRouter>)
}

export default App;