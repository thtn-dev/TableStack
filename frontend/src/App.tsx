import { Routes, Route } from "react-router-dom";
import { MainWindow } from "@/windows/MainWindow";
import { StartupWindow } from "@/windows/StartupWindow";

function App() {
  return (
    <Routes>
      <Route path="/startup" element={<StartupWindow />} />
      <Route path="*" element={<MainWindow />} />
    </Routes>
  );
}

export default App;
