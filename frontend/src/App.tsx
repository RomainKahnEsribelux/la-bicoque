import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Booking from './pages/Booking'
import Home from './pages/Home'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/reservation" element={<Booking />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
