import { Routes, Route, HashRouter } from "react-router-dom";
import { MainWindow } from "@/windows/MainWindow";
import { StartupWindow } from "@/windows/StartupWindow";

function App() {
  return (
      <Routes>
        <Route path="/" element={<MainWindow />} />
        <Route path="/startup" element={<StartupWindow />} />
      </Routes>
  );
    
}

export default App;
