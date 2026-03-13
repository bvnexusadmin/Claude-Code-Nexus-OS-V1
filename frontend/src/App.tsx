import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Conversation from "./pages/Conversation";
import Bookings from "./pages/Bookings";
import Leads from "./pages/Leads";
import LeadProfile from "./pages/LeadProfile";
import Settings from "./pages/Settings";

import AppLayout from "./layout/AppLayout";
import RequireAuth from "./layout/RequireAuth";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* =====================
            PUBLIC
        ===================== */}
        <Route path="/login" element={<Login />} />

        {/* =====================
            PROTECTED APP
        ===================== */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* Default */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Core pages */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="inbox/:leadId" element={<Conversation />} />
          <Route path="bookings" element={<Bookings />} />

          {/* Leads */}
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:leadId" element={<LeadProfile />} />

          <Route path="settings" element={<Settings />} />
        </Route>

        {/* =====================
            FALLBACK
        ===================== */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
