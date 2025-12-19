import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="navWrap">
      <div className="navInner">
        <NavLink to="/" className="brand">
          Rent Manager
        </NavLink>

        <nav className="navRight">
          <NavLink to="/" className={({ isActive }) => (isActive ? "navLink active" : "navLink")}>
            Home
          </NavLink>

          <NavLink to="/rent" className={({ isActive }) => (isActive ? "navLink active" : "navLink")}>
            Rent
          </NavLink>

          <NavLink
            to="/properties"
            className={({ isActive }) => (isActive ? "navLink active" : "navLink")}
          >
            Property List
          </NavLink>

          <button className="signinBtn" type="button">
            Sign In
          </button>
        </nav>
      </div>
    </header>
  );
}
