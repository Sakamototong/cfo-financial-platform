import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

interface ProtectedRouteProps {
  children: React.ReactElement
}

/**
 * ProtectedRoute - Component for protecting routes from unauthorized access
 * 
 * Checks if user has a valid access token before rendering the protected content.
 * If no token is found, redirects to login page and preserves the intended destination.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const token = localStorage.getItem('access_token')

  if (!token) {
    // Save the location user was trying to access
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
