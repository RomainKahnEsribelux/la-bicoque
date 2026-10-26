import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Booking from './pages/Booking'
import Home from './pages/Home'
import Login from './pages/Login'
import Owner from './pages/Owner'
import AuthProvider from './auth/AuthProvider'
import RequireAuth, { ProfileRequired } from './auth/RequireAuth'
import Signup from './pages/Signup'
import Profile from './pages/Profile'
import AuthCallback from './pages/AuthCallback'
import About from './pages/About'
import Contact from './pages/Contact'
import Stories from './pages/Stories'
import StoryDetail from './pages/StoryDetail'
import Documents from './pages/Documents'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/connexion" element={<Login />} />
            <Route path="/inscription" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/a-propos" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route element={<RequireAuth />}>
              <Route path="/profil" element={<Profile />} />
              <Route path="/histoires" element={<Stories />} />
              <Route path="/histoires/:slug" element={<StoryDetail />} />
              <Route path="/documents" element={<Documents />} />
              <Route element={<ProfileRequired />}>
                <Route path="/reservation" element={<Booking />} />
              </Route>
              <Route element={<ProfileRequired allowOwner />}>
                <Route path="/gestion" element={<Owner />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
