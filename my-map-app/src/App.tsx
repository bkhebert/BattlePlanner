import { BrowserRouter, Routes, Route, HashRouter as Router } from "react-router-dom";
import TerrainContourMap from "./views/MainMap";
import ThreeDeeMap from "./views/ThreeDeeMap";
const App = () => {
  return (
  <Router>
  <Routes>
    <Route path="/MAINMAP" element={<TerrainContourMap/>}/>
    <Route path="/3DMAP" element={<ThreeDeeMap/>}></Route>
  </Routes>
  </Router>)
}

export default App;