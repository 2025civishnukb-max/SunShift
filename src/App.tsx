import { HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { StoreProvider } from './lib/store';
import { DashboardLayout } from './components/DashboardLayout';
import Overview from './pages/Overview';
import LiveEnergyFlow from './pages/LiveEnergyFlow';
import DigitalTwin from './pages/DigitalTwin';
import Forecast from './pages/Forecast';
import BatteryPage from './pages/Battery';
import Appliances from './pages/Appliances';
import Scenarios from './pages/Scenarios';
import DayAheadPlan from './pages/DayAheadPlan';
import Savings from './pages/Savings';
import RunHistory from './pages/RunHistory';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import RooftopEstimator from './pages/RooftopEstimator';
import SolarCalculator from './pages/SolarCalculator';

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/live-energy-flow" element={<LiveEnergyFlow />} />
            <Route path="/digital-twin" element={<DigitalTwin />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/battery" element={<BatteryPage />} />
            <Route path="/appliances" element={<Appliances />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/day-ahead-plan" element={<DayAheadPlan />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/run-history" element={<RunHistory />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/rooftop-estimator" element={<RooftopEstimator />} />
            <Route path="/solar-calculator" element={<SolarCalculator />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Overview />} />
          </Route>
        </Routes>
      </HashRouter>
      </StoreProvider>
    </AuthProvider>
  );
}
