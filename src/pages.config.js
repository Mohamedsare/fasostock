/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Alerts from './pages/Alerts';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Forecast from './pages/Forecast';
import POS from './pages/POS';
import Sales from './pages/Sales';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import ShopManager from './pages/ShopManager';
import Stock from './pages/Stock';
import UserManagement from './pages/UserManagement';
import Workshop from './pages/Workshop';
import CRM from './pages/CRM';
import Reports from './pages/Reports';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Login": Login,
    "Alerts": Alerts,
    "Dashboard": Dashboard,
    "Finance": Finance,
    "Forecast": Forecast,
    "POS": POS,
    "Sales": Sales,
    "Settings": Settings,
    "Categories": Categories,
    "ShopManager": ShopManager,
    "Stock": Stock,
    "UserManagement": UserManagement,
    "Workshop": Workshop,
    "CRM": CRM,
    "Reports": Reports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};