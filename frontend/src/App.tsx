import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Booking from './pages/Booking'
import Home from './pages/Home'
import Login from './pages/Login'
import Owner from './pages/Owner'
import AuthProvider from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/connexion" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route path="/reservation" element={<Booking />} />
              <Route path="/gestion" element={<Owner />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
