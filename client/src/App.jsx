import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Rent from "./pages/Rent";
import PropertyList from "./pages/PropertyList";
import "./App.css";


export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rent" element={<Rent />} />
        <Route path="/properties" element={<PropertyList />} />
      </Routes>
    </BrowserRouter>
  );
}
